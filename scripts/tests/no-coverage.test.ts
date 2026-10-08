/**
 * No-coverage escalation: deterministic, safe, and promise-free.
 * Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import { buildNoCoverageAnalysis, NO_COVERAGE_MODEL } from '../../lib/ai/no-coverage';
import { assessCase } from '../../lib/ai/safety/safety-evaluator';
import {
  RUNTIME_REVIEW_FRAGMENTS,
  RUNTIME_SAFETY_FRAGMENTS
} from '../../lib/ai/safety/policy';
import { rawAnalysisSchema } from '../../lib/ai/analysis-schema';

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

console.log('No-coverage escalation');
const result = buildNoCoverageAnalysis();

check('passes both safety tiers as SAFE', () => {
  const fields = {
    summary: result.summary,
    recommendedAction: result.recommendedAction,
    draftResponse: result.draftResponse
  };
  assert.equal(assessCase(fields, RUNTIME_SAFETY_FRAGMENTS).outcome, 'SAFE');
  const review = assessCase(fields, RUNTIME_REVIEW_FRAGMENTS);
  assert.equal(review.assertedFragments.length + review.ambiguousFragments.length, 0);
});

check('draft makes no promise about money, outcome or timing', () => {
  assert.doesNotMatch(
    result.draftResponse,
    /refund|credit|discount|waive|compensat|guarantee|within|\d/i
  );
});

check('is declared as missing knowledge and is clearly marked by model id', () => {
  assert.equal(NO_COVERAGE_MODEL, 'no-coverage-escalation');
  assert.ok(result.missingInformation.length > 0);
});

check('text fits the analysis schema length limits', () => {
  const parsed = rawAnalysisSchema.shape;
  assert.ok(parsed.summary.safeParse(result.summary).success);
  assert.ok(parsed.recommendedAction.safeParse(result.recommendedAction).success);
  assert.ok(parsed.draftResponse.safeParse(result.draftResponse).success);
});

if (failures > 0) {
  console.error(`\nno-coverage.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nno-coverage.test.ts: all checks passed');
