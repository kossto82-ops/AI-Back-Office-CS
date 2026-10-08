/**
 * Pilot metrics computed from content-free case_events.
 *
 * Pure (no DB, no server-only) so the insights page, the CLI script and the unit
 * tests share one definition. Every rate carries its numerator and denominator:
 * with a small n these numbers describe what happened, they do not prove a
 * productivity gain. Handling time is first `case_opened` -> `case_resolved` on
 * the same case and therefore includes idle time; use medians, not means.
 */

export type MetricEvent = {
  caseId: number;
  type: string;
  meta: Record<string, unknown>;
  createdAt: Date;
};

export type Rate = { n: number; d: number };
export type Median = { ms: number | null; n: number };

export type InsightMetrics = {
  casesCreated: number;
  casesOpened: number;
  casesResolved: number;
  attempts: number;
  succeeded: number;
  blocked: number;
  blockedRate: Rate;
  blockedByReason: Array<{ reason: string; count: number }>;
  rerunRate: Rate;
  latency: Median;
  copies: number;
  copiedUnedited: Rate;
  /** Cases where the AI draft was held for review (stored flagged). */
  heldCases: number;
  /** Of those, cases where a draft was copied afterwards (after acknowledging). */
  heldCopied: Rate;
  handling: { all: Median; withAi: Median; withoutAi: Median };
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeInsights(events: MetricEvent[]): InsightMetrics {
  const ordered = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
  const of = (type: string) => ordered.filter((e) => e.type === type);
  const distinctCases = (type: string) => new Set(of(type).map((e) => e.caseId));

  const succeeded = of('analysis_succeeded');
  const blocked = of('analysis_blocked');
  const attempts = succeeded.length + blocked.length;
  const copies = of('draft_copied');
  const unedited = copies.filter((e) => e.meta.edited === false);

  const reasons = new Map<string, number>();
  for (const e of blocked) {
    const reason = typeof e.meta.reason === 'string' ? e.meta.reason : 'unknown';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const latencies = succeeded
    .map((e) => e.meta.latencyMs)
    .filter((v): v is number => typeof v === 'number');
  const reruns = succeeded.filter((e) => e.meta.rerun === true).length;

  // Held analyses that were stored for review, and whether a copy followed.
  const heldAt = new Map<number, Date>();
  for (const e of blocked) {
    if (e.meta.reason === 'manual_review' && e.meta.persistedForReview === true) {
      if (!heldAt.has(e.caseId)) heldAt.set(e.caseId, e.createdAt);
    }
  }
  let heldCopied = 0;
  for (const [caseId, at] of heldAt) {
    if (copies.some((c) => c.caseId === caseId && c.createdAt >= at)) heldCopied += 1;
  }

  const firstOpen = new Map<number, Date>();
  for (const e of of('case_opened')) {
    if (!firstOpen.has(e.caseId)) firstOpen.set(e.caseId, e.createdAt);
  }
  const analyzed = distinctCases('analysis_succeeded');
  const all: number[] = [];
  const withAi: number[] = [];
  const withoutAi: number[] = [];
  const seenResolved = new Set<number>();
  for (const e of of('case_resolved')) {
    if (seenResolved.has(e.caseId)) continue;
    seenResolved.add(e.caseId);
    const opened = firstOpen.get(e.caseId);
    if (!opened) continue;
    const ms = e.createdAt.getTime() - opened.getTime();
    if (ms < 0) continue;
    all.push(ms);
    (analyzed.has(e.caseId) ? withAi : withoutAi).push(ms);
  }

  return {
    casesCreated: distinctCases('case_created').size,
    casesOpened: distinctCases('case_opened').size,
    casesResolved: distinctCases('case_resolved').size,
    attempts,
    succeeded: succeeded.length,
    blocked: blocked.length,
    blockedRate: { n: blocked.length, d: attempts },
    blockedByReason: [...reasons]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    rerunRate: { n: reruns, d: succeeded.length },
    latency: { ms: median(latencies), n: latencies.length },
    copies: copies.length,
    copiedUnedited: { n: unedited.length, d: copies.length },
    heldCases: heldAt.size,
    heldCopied: { n: heldCopied, d: heldAt.size },
    handling: {
      all: { ms: median(all), n: all.length },
      withAi: { ms: median(withAi), n: withAi.length },
      withoutAi: { ms: median(withoutAi), n: withoutAi.length }
    }
  };
}

export function formatRate(rate: Rate): string {
  return rate.d === 0 ? 'n/a' : `${((rate.n / rate.d) * 100).toFixed(0)}% (${rate.n}/${rate.d})`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return 'n/a';
  const seconds = ms / 1000;
  if (seconds < 90) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

export const BLOCK_REASON_LABELS: Record<string, string> = {
  no_knowledge: 'No matching knowledge',
  manual_review: 'Held for human review',
  safety_violation: 'Rejected by the safety check',
  invalid_output: 'Invalid or ungrounded output',
  provider_error: 'AI provider error',
  provider_unavailable: 'AI provider not configured',
  unknown: 'Other'
};
