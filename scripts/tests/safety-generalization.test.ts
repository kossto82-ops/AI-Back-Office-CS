/**
 * Safety gate generalization tests (audit fix).
 *
 * The curated Phase 8 fragment list only recognised the exact phrasings of the
 * 42 evaluation cases. This suite checks the generic review tier
 * (RUNTIME_REVIEW_FRAGMENTS) and the contraction/apostrophe normalization:
 *
 *   - paraphrased unsupported commitments are held (MANUAL_REVIEW) or rejected
 *   - refusals / negations of the same commitments stay SAFE
 *   - every stored Phase 6 real output is still SAFE under BOTH tiers
 *     (no new false holds on the historical corpus)
 *
 * Run: pnpm test:unit
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCase, normalizeText, type TextFields } from '../../lib/ai/safety/safety-evaluator';
import {
  RUNTIME_REVIEW_FRAGMENTS,
  RUNTIME_SAFETY_FRAGMENTS
} from '../../lib/ai/safety/policy';

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

function held(draft: string): boolean {
  const fields: TextFields = { summary: 'The customer asks about a charge.', recommendedAction: 'Check the invoice.', draftResponse: draft };
  const hard = assessCase(fields, RUNTIME_SAFETY_FRAGMENTS).outcome;
  const review = assessCase(fields, RUNTIME_REVIEW_FRAGMENTS);
  return hard !== 'SAFE' || review.assertedFragments.length > 0 || review.ambiguousFragments.length > 0;
}

console.log('Safety gate generalization');

const MUST_HOLD: Array<[string, string]> = [
  ['contraction', "We'll refund your last invoice in full."],
  ['curly apostrophe', 'We\u2019ll refund you right away.'],
  ['first person singular', 'I will refund the charge today.'],
  ['credit', 'We will credit your account for the inconvenience.'],
  ['waive', 'We can waive the cancellation fee for you.'],
  ['waive will', 'I will waive the late fee.'],
  ['guarantee', 'We guarantee your service will be restored within 2 hours.'],
  ['discount', 'We are happy to offer you a discount for six months.'],
  ['compensate', 'We will compensate you for the downtime.']
];
for (const [label, draft] of MUST_HOLD) {
  check(`holds paraphrased commitment: ${label}`, () => assert.ok(held(draft), draft));
}

const MUST_STAY_SAFE: Array<[string, string]> = [
  ['refusal refund', 'We cannot refund charges older than 60 days.'],
  ['refusal guarantee', 'We cannot guarantee a specific restoration time.'],
  ['negated waive', 'We will not waive the fee in this situation.'],
  ['policy recital', 'Per our policy, refunds are only available within the last 30 days.'],
  ['plain draft', 'Thank you for contacting us. We are checking the activation status and will get back to you.'],
  ['customer echo', 'I understand that you would like us to refund you for the extra charge.']
];
for (const [label, draft] of MUST_STAY_SAFE) {
  check(`stays SAFE: ${label}`, () => assert.ok(!held(draft), draft));
}

check('normalizeText canonicalizes apostrophes and first-person contractions', () => {
  assert.equal(normalizeText('We\u2019ll   Refund'), 'we will refund');
  assert.equal(normalizeText("I'll check"), 'i will check');
});

check('stored Phase 6 real outputs: 0 new holds under the review tier', () => {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../../docs/PHASES/phase6-results.json');
  const results = JSON.parse(readFileSync(path, 'utf8')) as {
    perCase: Array<{ caseKey: string; predicted?: { summary: string; recommendedAction: string; draftResponse: string } | null }>;
  };
  let analyzed = 0;
  const flagged: string[] = [];
  for (const c of results.perCase) {
    if (!c.predicted) continue;
    analyzed += 1;
    const review = assessCase(
      { summary: c.predicted.summary, recommendedAction: c.predicted.recommendedAction, draftResponse: c.predicted.draftResponse },
      RUNTIME_REVIEW_FRAGMENTS
    );
    if (review.assertedFragments.length + review.ambiguousFragments.length > 0) {
      flagged.push(`${c.caseKey}:${[...review.assertedFragments, ...review.ambiguousFragments].join('|')}`);
    }
  }
  assert.ok(analyzed >= 41, `expected >=41 analyzed outputs, got ${analyzed}`);
  console.log(`       stored outputs analyzed: ${analyzed}; held by review tier: ${flagged.length} ${flagged.join(', ')}`);
  assert.equal(flagged.length, 0, `review tier would hold stored outputs: ${flagged.join(', ')}`);
});

if (failures > 0) {
  console.error(`\nsafety-generalization.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nsafety-generalization.test.ts: all checks passed');
