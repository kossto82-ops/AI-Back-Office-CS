/**
 * Offline evaluation of the commitment gates (no API calls, no database).
 *
 *   npx tsx scripts/audit/evaluate-commitment-gates.ts
 *
 * Corpus A: 60 real gpt-4o-mini outputs with fixed labels
 *   (docs/PHASES/commitment-corpus-outputs.json / -labels.json).
 * Corpus B: the 42 stored Phase 6 real outputs. These carry NO commitment labels,
 *   so every detector hit on them is printed for manual inspection instead of
 *   being scored.
 *
 * Gates compared on the same text:
 *   before    Phase 8 curated fragments (hard) + generic review tier over summary,
 *             action and draft (the gate as first shipped by this audit)
 *   grounded  lib/ai/safety/grounded-commitments.ts (draft only)
 *   now       what analyzeCase runs: curated fragments + generic tier over the draft
 *             only + grounded check
 */
import { readFileSync } from 'node:fs';
import { EVAL_CASES, EVAL_DOCUMENTS } from '../phase5a/dataset';
import { assessCase } from '../../lib/ai/safety/safety-evaluator';
import { RUNTIME_REVIEW_FRAGMENTS, RUNTIME_SAFETY_FRAGMENTS } from '../../lib/ai/safety/policy';
import { findUnsupportedCommitments } from '../../lib/ai/safety/grounded-commitments';
import { COMMITMENT_CORPUS } from './commitment-corpus';

type Fields = { summary: string; recommendedAction: string; draftResponse: string };
const docByTitle = new Map(EVAL_DOCUMENTS.map((d) => [d.title, d]));

function currentGate(fields: Fields, draftOnlyTier2 = false): 'SAFE' | 'HOLD' | 'REJECT' {
  const hard = assessCase(fields, RUNTIME_SAFETY_FRAGMENTS);
  if (hard.outcome === 'VIOLATION') return 'REJECT';
  const review = assessCase(
    draftOnlyTier2 ? { summary: '', recommendedAction: '', draftResponse: fields.draftResponse } : fields,
    RUNTIME_REVIEW_FRAGMENTS
  );
  if (hard.outcome === 'MANUAL_REVIEW' || review.assertedFragments.length + review.ambiguousFragments.length > 0) return 'HOLD';
  return 'SAFE';
}

const outputs = JSON.parse(readFileSync('docs/PHASES/commitment-corpus-outputs.json', 'utf8')) as {
  results: Array<{ key: string; group: string; retrieved: Array<{ title: string }>; output: Fields }>;
};
const labels = JSON.parse(readFileSync('docs/PHASES/commitment-corpus-labels.json', 'utf8')) as {
  labels: Array<{ key: string; unsupportedCommitment: boolean }>;
};
const labelOf = new Map(labels.labels.map((l) => [l.key, l.unsupportedCommitment]));
const caseOf = new Map(COMMITMENT_CORPUS.map((c) => [c.key, c]));

type Row = { key: string; group: string; positive: boolean; current: string; scoped: string; grounded: string[] };
const rowsA: Row[] = outputs.results.map((r) => {
  const c = caseOf.get(r.key)!;
  const docs = r.retrieved.map((d) => docByTitle.get(d.title)!);
  const grounded = findUnsupportedCommitments({
    draftResponse: r.output.draftResponse,
    caseText: `${c.subject} ${c.customerMessage}`,
    docs
  }).map((f) => `${f.kind}: ${f.sentence}`);
  return { key: r.key, group: r.group, positive: labelOf.get(r.key) === true, current: currentGate(r.output), scoped: currentGate(r.output, true), grounded };
});

function table(rows: Row[], label: string, flagged: (r: Row) => boolean) {
  const pos = rows.filter((r) => r.positive);
  const neg = rows.filter((r) => !r.positive);
  const tp = pos.filter(flagged).length;
  const fp = neg.filter(flagged).length;
  console.log(`  ${label.padEnd(10)} detected ${tp}/${pos.length} positives · false flags ${fp}/${neg.length} negatives`);
  for (const r of neg.filter(flagged)) console.log(`      false flag ${r.key} (${r.group}) ${r.current !== 'SAFE' ? r.current : ''} ${r.grounded[0] ?? ''}`);
}

console.log(`\nCorpus A: ${rowsA.length} real outputs, ${rowsA.filter((r) => r.positive).length} labelled positive`);
table(rowsA, 'before', (r) => r.current !== 'SAFE');
table(rowsA, 'grounded', (r) => r.grounded.length > 0);
table(rowsA, 'now', (r) => r.scoped !== 'SAFE' || r.grounded.length > 0);

// ---- Corpus B: stored Phase 6 outputs, unlabeled -> print every hit
const phase6 = JSON.parse(readFileSync('docs/PHASES/phase6-results.json', 'utf8')) as {
  perCase: Array<{ caseKey: string; retrieved?: Array<{ title: string }>; predicted?: Fields | null }>;
};
const evalCase = new Map(EVAL_CASES.map((c) => [c.key, c]));
let analyzed = 0;
let currentHits = 0;
const groundedHits: string[] = [];
for (const p of phase6.perCase) {
  if (!p.predicted || !p.retrieved) continue;
  const c = evalCase.get(p.caseKey);
  if (!c) continue;
  analyzed += 1;
  if (currentGate(p.predicted, true) !== 'SAFE') currentHits += 1;
  const history = (c.conversationHistory ?? []).map((t) => t.content).join(' ');
  const docs = p.retrieved.map((d) => docByTitle.get(d.title)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  for (const f of findUnsupportedCommitments({
    draftResponse: p.predicted.draftResponse,
    caseText: `${c.subject} ${c.customerMessage} ${history}`,
    docs
  })) {
    groundedHits.push(`${p.caseKey} [${f.kind}] ${f.sentence}  <- ${f.detail}`);
  }
}
console.log(`\nCorpus B: ${analyzed} stored Phase 6 outputs (unlabelled)`);
console.log(`  current gate holds/rejects: ${currentHits}`);
console.log(`  grounded check findings: ${groundedHits.length}`);
for (const h of groundedHits) console.log(`    ${h}`);
