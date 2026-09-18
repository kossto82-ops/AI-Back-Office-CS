/**
 * Focused tests for source-id normalization and grounding enforcement.
 *
 * Run: pnpm test:unit
 *
 * No test framework is installed in this project, so this is a tiny assertion
 * script (matching the existing tsx script convention). It exercises the pure
 * `lib/ai/source-ids` module directly — no DB, no provider, no server-only.
 */

import assert from 'node:assert/strict';
import type { RetrievedDocument } from '@/lib/ai/retrieval';
import { AiInvalidOutputError } from '@/lib/ai/errors';
import { normalizeSourceId, resolveSources } from '@/lib/ai/source-ids';

function doc(
  documentId: number,
  title: string,
  score: number
): RetrievedDocument {
  return {
    documentId,
    title,
    type: 'faq',
    status: 'active',
    version: 1,
    content: `${title} content`,
    score
  };
}

// Team A retrieved these documents for the case under analysis.
const TEAM_A_RETRIEVED: RetrievedDocument[] = [
  doc(92, 'Invoice Adjustment and Refund Limits', 5),
  doc(93, 'Expired Promotional Discount Policy', 4)
];

let failures = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}: ${message}`);
  }
}

function sources(...ids: string[]) {
  return { sources: ids };
}

console.log('[source-ids] normalizeSourceId — accepted variations');
check('"92" -> "92"', () => assert.equal(normalizeSourceId('92'), '92'));
check('"[92]" -> "92"', () => assert.equal(normalizeSourceId('[92]'), '92'));
check('" 92 " -> "92"', () => assert.equal(normalizeSourceId(' 92 '), '92'));
check('"[ 92 ]" -> "92"', () => assert.equal(normalizeSourceId('[ 92 ]'), '92'));
check('"092" -> "92"', () => assert.equal(normalizeSourceId('092'), '92'));

console.log('[source-ids] normalizeSourceId — rejected (not a bare numeric id)');
check('empty string -> null', () => assert.equal(normalizeSourceId(''), null));
check('"   " -> null', () => assert.equal(normalizeSourceId('   '), null));
check('"[]" -> null', () => assert.equal(normalizeSourceId('[]'), null));
check('"[ ]" -> null', () => assert.equal(normalizeSourceId('[ ]'), null));
check('title -> null', () =>
  assert.equal(normalizeSourceId('Invoice Adjustment and Refund Limits'), null));
check('bracketed title -> null', () =>
  assert.equal(normalizeSourceId('[Invoice Adjustment and Refund Limits]'), null));
check('"9.2" -> null', () => assert.equal(normalizeSourceId('9.2'), null));
check('"9 2" -> null', () => assert.equal(normalizeSourceId('9 2'), null));
check('nested "[[92]]" -> null', () =>
  assert.equal(normalizeSourceId('[[92]]'), null));

console.log('[source-ids] resolveSources — accepted variations of retrieved id 92');
check('"92" resolves to doc 92', () => {
  const refs = resolveSources(sources('92'), TEAM_A_RETRIEVED);
  assert.deepEqual(refs, [{ documentId: 92, relevance: 5 }]);
});
check('"[92]" resolves to doc 92', () => {
  const refs = resolveSources(sources('[92]'), TEAM_A_RETRIEVED);
  assert.deepEqual(refs, [{ documentId: 92, relevance: 5 }]);
});
check('" 92 " resolves to doc 92', () => {
  const refs = resolveSources(sources(' 92 '), TEAM_A_RETRIEVED);
  assert.deepEqual(refs, [{ documentId: 92, relevance: 5 }]);
});
check('"[ 92 ]" resolves to doc 92', () => {
  const refs = resolveSources(sources('[ 92 ]'), TEAM_A_RETRIEVED);
  assert.deepEqual(refs, [{ documentId: 92, relevance: 5 }]);
});
check('mixed forms + multiple docs resolve in order', () => {
  const refs = resolveSources(sources('[92]', ' 93 '), TEAM_A_RETRIEVED);
  assert.deepEqual(refs, [
    { documentId: 92, relevance: 5 },
    { documentId: 93, relevance: 4 }
  ]);
});
check('empty sources -> empty result', () => {
  assert.deepEqual(resolveSources(sources(), TEAM_A_RETRIEVED), []);
});

console.log('[source-ids] resolveSources — rejected (grounding preserved)');
check('"9999" not retrieved -> throws', () => {
  assert.throws(
    () => resolveSources(sources('9999'), TEAM_A_RETRIEVED),
    AiInvalidOutputError
  );
});
check('"[9999]" not retrieved -> throws', () => {
  assert.throws(
    () => resolveSources(sources('[9999]'), TEAM_A_RETRIEVED),
    AiInvalidOutputError
  );
});
check('arbitrary document title -> throws', () => {
  assert.throws(
    () =>
      resolveSources(
        sources('Invoice Adjustment and Refund Limits'),
        TEAM_A_RETRIEVED
      ),
    AiInvalidOutputError
  );
});
check('one valid + one ungrounded id -> throws (no partial accept)', () => {
  assert.throws(
    () => resolveSources(sources('92', '9999'), TEAM_A_RETRIEVED),
    AiInvalidOutputError
  );
});

console.log('[source-ids] tenant isolation');
check("another team's document id is rejected (not in retrieved set)", () => {
  // Team B owns doc 77, which is not part of the documents retrieved for the
  // Team A case. Passing its id must be refused even in bracketed form.
  assert.throws(
    () => resolveSources(sources('77'), TEAM_A_RETRIEVED),
    AiInvalidOutputError
  );
  assert.throws(
    () => resolveSources(sources('[77]'), TEAM_A_RETRIEVED),
    AiInvalidOutputError
  );
});

if (failures > 0) {
  console.error(`\n[source-ids] ${failures} test(s) failed`);
  process.exit(1);
}
console.log('\n[source-ids] all tests passed');
