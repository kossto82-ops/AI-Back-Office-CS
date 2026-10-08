/**
 * Insights metrics: definitions, denominators and edge cases.
 * Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import {
  computeInsights,
  formatDuration,
  formatRate,
  type MetricEvent
} from '../../lib/insights/metrics';

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const t0 = Date.UTC(2026, 9, 1, 9, 0, 0);
function ev(caseId: number, type: string, offsetSec: number, meta: Record<string, unknown> = {}): MetricEvent {
  return { caseId, type, meta, createdAt: new Date(t0 + offsetSec * 1000) };
}

console.log('Insights metrics');

check('empty input gives zeros and n/a, never NaN', () => {
  const m = computeInsights([]);
  assert.equal(m.attempts, 0);
  assert.equal(formatRate(m.blockedRate), 'n/a');
  assert.equal(formatDuration(m.latency.ms), 'n/a');
  assert.equal(m.handling.all.n, 0);
});

check('blocked rate and reasons count every attempt; reasons sorted by frequency', () => {
  const m = computeInsights([
    ev(1, 'analysis_succeeded', 1, { latencyMs: 4000 }),
    ev(2, 'analysis_blocked', 2, { reason: 'manual_review' }),
    ev(3, 'analysis_blocked', 3, { reason: 'no_knowledge' }),
    ev(4, 'analysis_blocked', 4, { reason: 'no_knowledge' })
  ]);
  assert.deepEqual(m.blockedRate, { n: 3, d: 4 });
  assert.deepEqual(m.blockedByReason, [
    { reason: 'no_knowledge', count: 2 },
    { reason: 'manual_review', count: 1 }
  ]);
});

check('latency median ignores events without a number; re-run rate uses successes only', () => {
  const m = computeInsights([
    ev(1, 'analysis_succeeded', 1, { latencyMs: 1000, rerun: false }),
    ev(1, 'analysis_succeeded', 2, { latencyMs: 3000, rerun: true }),
    ev(2, 'analysis_succeeded', 3, {}),
    ev(3, 'analysis_blocked', 4, { reason: 'provider_error', latencyMs: 99999 })
  ]);
  assert.deepEqual(m.latency, { ms: 2000, n: 2 });
  assert.deepEqual(m.rerunRate, { n: 1, d: 3 });
});

check('copied-unedited counts only explicit edited=false', () => {
  const m = computeInsights([
    ev(1, 'draft_copied', 1, { edited: false }),
    ev(1, 'draft_copied', 2, { edited: true }),
    ev(2, 'draft_copied', 3, {})
  ]);
  assert.deepEqual(m.copiedUnedited, { n: 1, d: 3 });
});

check('handling time: first open to resolve, split by whether an AI analysis succeeded', () => {
  const m = computeInsights([
    ev(1, 'case_opened', 0),
    ev(1, 'case_opened', 50), // later opens do not move the start
    ev(1, 'analysis_succeeded', 10, {}),
    ev(1, 'case_resolved', 120),
    ev(2, 'case_opened', 0),
    ev(2, 'case_resolved', 600),
    ev(3, 'case_resolved', 30) // never opened: excluded, no negative/NaN
  ]);
  assert.deepEqual(m.handling.withAi, { ms: 120_000, n: 1 });
  assert.deepEqual(m.handling.withoutAi, { ms: 600_000, n: 1 });
  assert.deepEqual(m.handling.all, { ms: 360_000, n: 2 });
  assert.equal(m.casesResolved, 3);
});

check('a case resolved twice counts once in handling time', () => {
  const m = computeInsights([
    ev(1, 'case_opened', 0),
    ev(1, 'case_resolved', 60),
    ev(1, 'case_resolved', 5000)
  ]);
  assert.deepEqual(m.handling.all, { ms: 60_000, n: 1 });
});

check('held analyses: only persisted holds count, copy must follow the hold', () => {
  const m = computeInsights([
    ev(1, 'analysis_blocked', 10, { reason: 'manual_review', persistedForReview: true }),
    ev(1, 'draft_copied', 20, { edited: true }),
    ev(2, 'analysis_blocked', 10, { reason: 'manual_review', persistedForReview: true }),
    ev(3, 'analysis_blocked', 10, { reason: 'manual_review' }), // legacy: not stored
    ev(4, 'draft_copied', 5, { edited: false })
  ]);
  assert.equal(m.heldCases, 2);
  assert.deepEqual(m.heldCopied, { n: 1, d: 2 });
});

check('formatters', () => {
  assert.equal(formatRate({ n: 1, d: 3 }), '33% (1/3)');
  assert.equal(formatDuration(4200), '4.2 s');
  assert.equal(formatDuration(5 * 60_000), '5.0 min');
  assert.equal(formatDuration(3 * 3_600_000), '3.0 h');
});

if (failures > 0) {
  console.error(`\ninsights.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\ninsights.test.ts: all checks passed');
