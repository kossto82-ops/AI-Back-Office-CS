/**
 * Retrieval tokenizer regression tests (audit fix).
 *
 * The tokenizer used an ASCII-only pattern, so accented words were split in
 * two ("cancelación" -> "cancelaci" + "n") and non-Latin scripts produced no
 * keywords at all (retrieval silently returned nothing).
 *
 * Guarantees checked here, fully offline (no DB, no provider):
 *   1. English/ASCII behaviour is UNCHANGED: identical keywords for every
 *      Phase 5A/6 evaluation case compared with the previous implementation.
 *   2. Offline retrieval over the evaluation KB still finds an expected
 *      document in the top 5 for every answerable case (same rule as Phase 6).
 *   3. Accented words stay whole.
 *
 * Run: pnpm test:unit
 */

import assert from 'node:assert/strict';
import { scoreDocument, tokenize } from '../../lib/ai/retrieval-scoring';
import { EVAL_CASES, EVAL_DOCUMENTS } from '../phase5a/dataset';

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

// Verbatim copy of the pre-audit tokenizer, used only as the regression oracle.
const LEGACY_STOPWORDS = new Set([
  'the', 'and', 'are', 'for', 'but', 'not', 'you', 'your', 'that', 'this',
  'with', 'from', 'have', 'has', 'had', 'was', 'were', 'will', 'would',
  'which', 'than', 'into', 'been', 'being', 'their', 'them', 'they', 'there',
  'here', 'when', 'where', 'about', 'between', 'because', 'what', 'how',
  'can', 'could', 'should', 'just', 'then', 'want', 'would', 'also', 'more'
]);

function legacyTokenize(input: string): string[] {
  const words = input.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const word of words) {
    if (word.length < 4) continue;
    if (LEGACY_STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    keywords.push(word);
  }
  return keywords.slice(0, 12);
}

console.log('Retrieval tokenizer');

check('English keywords identical to legacy tokenizer for all eval cases', () => {
  for (const c of EVAL_CASES) {
    const query = `${c.subject} ${c.customerMessage}`;
    assert.deepEqual(tokenize(query), legacyTokenize(query), c.key);
  }
});

check('offline top-5 retrieval hits an expected document for every answerable case', () => {
  const docs = EVAL_DOCUMENTS.map((d) => ({ ...d, status: 'active' }));
  let answerable = 0;
  for (const c of EVAL_CASES.filter((x) => x.answerPossible && x.expectedDocumentTitles.length > 0)) {
    answerable += 1;
    const query = `${c.subject} ${c.customerMessage}`;
    const keywords = tokenize(query);
    const phrase = query.trim().toLowerCase();
    const top = docs
      .map((d) => ({ title: d.title, score: scoreDocument(d, keywords, phrase) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((d) => d.title);
    assert.ok(
      c.expectedDocumentTitles.some((t) => top.includes(t)),
      `${c.key}: none of ${JSON.stringify(c.expectedDocumentTitles)} in top 5 ${JSON.stringify(top)}`
    );
  }
  assert.ok(answerable >= 25, `expected >=25 answerable cases, got ${answerable}`);
});

check('accented words are kept whole', () => {
  assert.deepEqual(tokenize('Cancelación de la factura'), ['cancelación', 'factura']);
  assert.ok(tokenize('Mi línea no tiene señal').includes('señal'));
});

check('non-Latin text yields keywords instead of nothing', () => {
  assert.ok(tokenize('ยกเลิกบริการ ค่าธรรมเนียม').length > 0);
});

check('cap of 12 keywords and de-duplication preserved', () => {
  const many = Array.from({ length: 30 }, (_, i) => `keyword${i}`).join(' ');
  assert.equal(tokenize(many).length, 12);
  assert.deepEqual(tokenize('invoice invoice Invoice'), ['invoice']);
});

if (failures > 0) {
  console.error(`\nretrieval-tokenizer.test.ts: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nretrieval-tokenizer.test.ts: all checks passed');
