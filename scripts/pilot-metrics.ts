/**
 * Pilot metrics from case_events (content-free usage events), printed as text.
 *
 *   pnpm db:pilot-metrics            -> every team
 *   pnpm db:pilot-metrics <teamId>   -> one team
 *
 * The definitions live in lib/insights/metrics.ts and are shared with the
 * Insights page, so the two can never disagree. Rates always show their
 * denominator; with a small n they describe what happened and prove nothing.
 */
import 'dotenv/config';
import { asc, eq } from 'drizzle-orm';
import { db } from '../lib/db/drizzle';
import { caseEvents } from '../lib/db/schema';
import {
  BLOCK_REASON_LABELS,
  computeInsights,
  formatDuration,
  formatRate,
  type Median
} from '../lib/insights/metrics';

const med = (m: Median) => `${m.n === 0 ? 'n/a' : formatDuration(m.ms)} (n=${m.n})`;

async function main(): Promise<void> {
  const only = process.argv[2] ? Number(process.argv[2]) : null;
  const rows = await (only
    ? db.select().from(caseEvents).where(eq(caseEvents.teamId, only)).orderBy(asc(caseEvents.createdAt))
    : db.select().from(caseEvents).orderBy(asc(caseEvents.createdAt)));

  if (rows.length === 0) {
    console.log('No case_events recorded yet.');
    process.exit(0);
  }

  const byTeam = new Map<number, typeof rows>();
  for (const row of rows) byTeam.set(row.teamId, [...(byTeam.get(row.teamId) ?? []), row]);

  for (const [teamId, events] of byTeam) {
    const m = computeInsights(
      events.map((e) => ({
        caseId: e.caseId,
        type: e.type,
        meta: (e.meta ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt
      }))
    );
    console.log(`\n=== Team ${teamId} ===`);
    console.log(`cases created via intake : ${m.casesCreated}`);
    console.log(`cases opened / resolved  : ${m.casesOpened} / ${m.casesResolved}`);
    console.log(`analysis attempts        : ${m.attempts} (succeeded ${m.succeeded}, not normal ${m.blocked})`);
    console.log(`  not-normal rate        : ${formatRate(m.blockedRate)}`);
    for (const { reason, count } of m.blockedByReason) {
      console.log(`    ${(BLOCK_REASON_LABELS[reason] ?? reason).padEnd(32)} ${count}`);
    }
    console.log(`  re-run rate            : ${formatRate(m.rerunRate)}`);
    console.log(`  analysis latency       : median ${med(m.latency)}`);
    console.log(`drafts copied            : ${m.copies}`);
    console.log(`  copied unedited        : ${formatRate(m.copiedUnedited)}`);
    console.log(`  held drafts then copied: ${formatRate(m.heldCopied)}`);
    console.log(`handling time (median)   : ${med(m.handling.all)}`);
    console.log(`  with AI analysis       : ${med(m.handling.withAi)}`);
    console.log(`  without AI analysis    : ${med(m.handling.withoutAi)}`);
    if (m.handling.withAi.n < 10 || m.handling.withoutAi.n < 10) {
      console.log(
        '  NOTE: fewer than 10 cases per group. Cases are not randomized (agents choose when to use AI),\n' +
          '  so even a large difference is descriptive only. Use the Phase 9 controlled design for causal claims.'
      );
    }
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
