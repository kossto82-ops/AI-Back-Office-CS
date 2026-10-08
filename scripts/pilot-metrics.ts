/**
 * Pilot metrics from case_events (content-free usage events).
 *
 *   pnpm db:pilot-metrics            -> every team
 *   pnpm db:pilot-metrics <teamId>   -> one team
 *
 * Prints explicit denominators and never extrapolates: with a small n these
 * numbers describe what happened, they do not prove a productivity gain.
 * "Handling time" = first case_opened -> case_resolved on the same case, which
 * includes idle time with the tab open; use medians, not means.
 */
import 'dotenv/config';
import { asc, eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { caseEvents } from '../lib/db/schema';

type Ev = typeof caseEvents.$inferSelect;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(n: number, d: number): string {
  return d === 0 ? 'n/a (0 cases)' : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`;
}

function secs(ms: number | null): string {
  return ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`;
}

function report(teamId: number, events: Ev[]): void {
  const of = (type: string) => events.filter((e) => e.type === type);
  const caseIds = (type: string) => new Set(of(type).map((e) => e.caseId));

  const succeeded = of('analysis_succeeded');
  const blocked = of('analysis_blocked');
  const attempts = succeeded.length + blocked.length;
  const copies = of('draft_copied');
  const copiesUnedited = copies.filter((e) => (e.meta as { edited?: boolean }).edited === false);

  const blockedByReason = new Map<string, number>();
  for (const e of blocked) {
    const reason = String((e.meta as { reason?: string }).reason ?? 'unknown');
    blockedByReason.set(reason, (blockedByReason.get(reason) ?? 0) + 1);
  }

  const firstOpen = new Map<number, Date>();
  for (const e of of('case_opened')) {
    if (!firstOpen.has(e.caseId)) firstOpen.set(e.caseId, e.createdAt);
  }
  const handling: number[] = [];
  const handlingWithAi: number[] = [];
  const handlingWithoutAi: number[] = [];
  const analyzed = caseIds('analysis_succeeded');
  for (const e of of('case_resolved')) {
    const opened = firstOpen.get(e.caseId);
    if (!opened) continue;
    const ms = e.createdAt.getTime() - opened.getTime();
    if (ms < 0) continue;
    handling.push(ms);
    (analyzed.has(e.caseId) ? handlingWithAi : handlingWithoutAi).push(ms);
  }

  const latencies = succeeded
    .map((e) => (e.meta as { latencyMs?: number }).latencyMs)
    .filter((v): v is number => typeof v === 'number');
  const rerun = succeeded.filter((e) => (e.meta as { rerun?: boolean }).rerun === true).length;

  console.log(`\n=== Team ${teamId} ===`);
  console.log(`cases created via intake : ${caseIds('case_created').size}`);
  console.log(`cases opened             : ${caseIds('case_opened').size}`);
  console.log(`analysis attempts        : ${attempts} (succeeded ${succeeded.length}, blocked ${blocked.length})`);
  console.log(`  blocked rate           : ${pct(blocked.length, attempts)}`);
  for (const [reason, n] of [...blockedByReason].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason.padEnd(20)} ${n}`);
  }
  console.log(`  re-run rate            : ${pct(rerun, succeeded.length)}`);
  console.log(`  analysis latency       : median ${secs(median(latencies))} (n=${latencies.length})`);
  console.log(`drafts copied            : ${copies.length}`);
  console.log(`  copied unedited        : ${pct(copiesUnedited.length, copies.length)}`);
  console.log(`cases resolved           : ${caseIds('case_resolved').size}`);
  console.log(`  handling time (median) : ${secs(median(handling))} (n=${handling.length})`);
  console.log(`    with AI analysis     : ${secs(median(handlingWithAi))} (n=${handlingWithAi.length})`);
  console.log(`    without AI analysis  : ${secs(median(handlingWithoutAi))} (n=${handlingWithoutAi.length})`);
  if (handlingWithAi.length < 10 || handlingWithoutAi.length < 10) {
    console.log(
      '  NOTE: fewer than 10 cases per group. Cases are not randomized (agents choose when to use AI), so even a large\n' +
        '  difference here is descriptive only. Use the Phase 9 controlled design for any causal claim.'
    );
  }
}

async function main(): Promise<void> {
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  const rows = await (only
    ? db.select().from(caseEvents).where(eq(caseEvents.teamId, only)).orderBy(asc(caseEvents.createdAt))
    : db.select().from(caseEvents).orderBy(asc(caseEvents.createdAt)));

  if (rows.length === 0) {
    console.log('No case_events recorded yet.');
    process.exit(0);
  }
  const byTeam = new Map<number, Ev[]>();
  for (const row of rows) {
    byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row]);
  }
  for (const [teamId, events] of byTeam) report(teamId, events);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
