/**
 * Phase 7 �?" deterministic safety re-evaluation and confidence audit.
 *
 * Re-runs the context-aware safety evaluator over the STORED Phase 6 real
 * outputs (docs/PHASES/phase6-results.json). No provider calls, no DB, no new
 * API spend. Two outputs, printed only (the single authoritative Phase 7 report
 * is docs/PHASES/PHASE7-SAFETY-CONFIDENCE-VALIDATION.md):
 *
 *   1. Safety re-scoring   �?" every `mustNotMention` fragment found in a stored
 *      output is now also classified (asserted violation / negation / refusal /
 *      customer echo / neutral policy / ambiguous). Detection stays byte-
 *      identical to Phase 5A/6; the verdict layer is purely additive.
 *
 *   2. Confidence audit    �?" classification correctness vs the adjudicated
 *      gold, sliced by confidence value, by band, and by boundary/core, plus
 *      the Phase 6 audit numbers recomputed from the same stored data.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCase, findFragments, VERDICT_KIND } from '../../lib/ai/safety/safety-evaluator';
import { PHASE6_CASES } from '../phase6/dataset';
import type { Category } from '../phase5a/dataset';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs/PHASES');
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

interface StoredPredicted {
  category: Category | null;
  confidence: number | null;
  summary: string;
  recommendedAction: string;
  draftResponse: string;
}

interface StoredCase {
  caseKey: string;
  archetype: string;
  category: Category;
  boundary: string;
  bannedHits: string[];
  predicted: StoredPredicted | null;
  errors: string[];
}

interface RanCase extends Omit<StoredCase, 'predicted'> {
  predicted: StoredPredicted;
}

const doc = JSON.parse(
  readFileSync(join(DOCS, 'phase6-results.json'), 'utf8')
) as { perCase: StoredCase[] };

const goldByKey = new Map(
  PHASE6_CASES.map((c) => [c.key, c])
);

type CaseRow = (typeof PHASE6_CASES)[number];
const goldOf = (key: string): CaseRow => {
  const g = goldByKey.get(key);
  if (!g) throw new Error(`missing dataset case ${key}`);
  return g;
};

const ran: RanCase[] = [];
for (const pc of doc.perCase) {
  if (pc.predicted && pc.errors.length === 0) {
    const { predicted, ...rest } = pc;
    ran.push({ ...rest, predicted });
  }
}

// ---------------------------------------------------------------------------
// 1. Safety re-scoring from stored outputs
// ---------------------------------------------------------------------------

const perOccurrence: Array<{
  caseKey: string;
  fragment: string;
  field: string;
  verdict: string;
}> = [];
const foundCount = new Map<string, number>();
const verdictCount: Record<string, number> = {};
let parityMismatch = 0;

for (const pc of ran) {
  const gold = goldOf(pc.caseKey);
  const fields = pc.predicted
    ? {
        summary: pc.predicted.summary,
        recommendedAction: pc.predicted.recommendedAction,
        draftResponse: pc.predicted.draftResponse
      }
    : { summary: '', recommendedAction: '', draftResponse: '' };

  const assessment = assessCase(fields, gold.mustNotMention);
  const found = findFragments(fields, gold.mustNotMention);

  const stored = [...pc.bannedHits].sort();
  const recomputed = [...found].sort();
  if (JSON.stringify(stored) !== JSON.stringify(recomputed)) parityMismatch += 1;

  if (found.length > 0) foundCount.set(pc.caseKey, found.length);
  for (const o of assessment.occurrences) {
    perOccurrence.push({
      caseKey: pc.caseKey,
      fragment: o.fragment,
      field: o.field,
      verdict: o.verdict
    });
    verdictCount[o.verdict] = (verdictCount[o.verdict] ?? 0) + 1;
  }
}

const assertedCases = perOccurrence
  .filter((o) => o.verdict === 'ASSERTED_VIOLATION')
  .map((o) => o.caseKey);
const ambiguousCases = perOccurrence
  .filter((o) => o.verdict === 'AMBIGUOUS')
  .map((o) => o.caseKey);

const casesWithBannedFragments = foundCount.size;
const criticalCount = [...foundCount.keys()].filter(
  (key) => ['unsupported', 'injection'].includes(goldOf(key).archetype)
).length;
const injectionBypasses = [...foundCount.keys()].filter(
  (key) => goldOf(key).archetype === 'injection'
).length;

const paragraph = (label: string, value: unknown): void =>
  console.log(`${label}: ${typeof value === 'number' ? value.toFixed(4) : value}`);

console.log('=== PHASE 7 SAFETY RE-SCORING (stored Phase 6 outputs) ===\n');
console.log(`analyzed cases: ${ran.length} of ${doc.perCase.length} stored`);
paragraph('detection parity foundFragments == stored bannedHits', `${ran.length - parityMismatch} / ${ran.length}`);
paragraph('casesWithBannedFragments (unchanged detection)', casesWithBannedFragments);
paragraph('criticalCount (unsupported/injection archetype)', criticalCount);
paragraph('injectionPolicyBypasses (injection archetype)', injectionBypasses);
paragraph('cases with ASSERTED_VIOLATION verdicts', assertedCases.length);
paragraph('cases with AMBIGUOUS verdicts (retained for manual review)', ambiguousCases.length);
console.log('\nverdict distribution (occurrence level):');
for (const [verdict, count] of Object.entries(verdictCount).sort()) {
  console.log(`  ${verdict}: ${count}`);
}
console.log('\nflagged cases (per fragment, per field, verdict):');
for (const o of perOccurrence) {
  console.log(
    `  ${o.caseKey} ${o.fragment.padEnd(24)} [${o.field.padEnd(17)}] -> ${o.verdict}`
  );
}

// ---------------------------------------------------------------------------
// 2. Confidence audit (deterministic, from stored data)
// ---------------------------------------------------------------------------

function bandOf(confidence: number | null): 'low' | 'medium' | 'high' | null {
  if (confidence === null) return null;
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

const correctCases = new Set<string>();
for (const pc of ran) {
  if (pc.predicted?.category !== null && pc.predicted.category === pc.category) {
    correctCases.add(pc.caseKey);
  }
}

const total = ran.length;
const correct = correctCases.size;
const accuracy = correct / total;

const byValue: Record<string, { total: number; correct: number }> = {};
const byBand: Record<string, { total: number; correct: number }> = {};
const bySubset: Record<string, { total: number; correct: number }> = {};

const addTo = (bucket: Record<string, { total: number; correct: number }>, key: string, ok: boolean): void => {
  bucket[key] ??= { total: 0, correct: 0 };
  bucket[key].total += 1;
  if (ok) bucket[key].correct += 1;
};

for (const pc of ran) {
  const conf = pc.predicted?.confidence ?? null;
  const ok = correctCases.has(pc.caseKey);
  if (conf !== null) addTo(byValue, conf.toString(), ok);
  const band = bandOf(conf);
  if (band) addTo(byBand, band, ok);
  if (conf !== null && conf >= HIGH_CONFIDENCE_THRESHOLD) addTo(bySubset, '>= 0.85', ok);
  if (conf !== null && conf >= 0.9) addTo(bySubset, '>= 0.90', ok);
  if (conf !== null && conf < HIGH_CONFIDENCE_THRESHOLD) addTo(bySubset, '< 0.85', ok);
}

const confidences = ran
  .map((pc) => pc.predicted?.confidence)
  .filter((c): c is number => c !== null);
const sortedConf = [...confidences].sort((a, b) => a - b);
const median = (xs: number[]): number => {
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[m - 1] + xs[m]) / 2 : xs[m];
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const boundaryWrong = ran.filter(
  (pc) => pc.boundary !== 'core' && !correctCases.has(pc.caseKey)
);
const coreWrong = ran.filter(
  (pc) => pc.boundary === 'core' && !correctCases.has(pc.caseKey)
);
const boundaryTotal = ran.filter((pc) => pc.boundary !== 'core').length;
const coreTotal = ran.filter((pc) => pc.boundary === 'core').length;

const confOfWrong = ran
  .filter((pc) => !correctCases.has(pc.caseKey))
  .map((pc) => pc.predicted?.confidence ?? NaN);
const confOfCorrect = ran
  .filter((pc) => correctCases.has(pc.caseKey))
  .map((pc) => pc.predicted?.confidence ?? NaN);

const fmt = (x: number, digits = 4): string => x.toFixed(digits);
const renderBucket = (bucket: Record<string, { total: number; correct: number }>): void => {
  for (const [key, v] of Object.entries(bucket).sort()) {
    console.log(
      `  ${key.padEnd(8)}: ${v.correct}/${v.total} = ${fmt(v.correct / v.total)} (${Math.round((v.correct / v.total) * 100)}%)`
    );
  }
};

console.log('\n=== PHASE 7 CONFIDENCE AUDIT (stored outputs vs adjudicated gold) ===\n');
paragraph('accuracy vs adjudicated gold', accuracy);
paragraph('correct / total', `${correct}/${total}`);
paragraph('confidence distribution (values used)',
  sortedConf.join(', '));
paragraph('confidence min', sortedConf[0]);
paragraph('confidence median', median(sortedConf));
paragraph('confidence max', sortedConf[sortedConf.length - 1]);
paragraph('confidence mean (all analyzed)', mean(sortedConf));

console.log('\naccuracy by exact confidence value:');
renderBucket(byValue);
console.log('\naccuracy by band (low <0.4 / medium 0.4-0.7 / high >=0.7):');
renderBucket(byBand);
console.log('\naccuracy by threshold subset:');
renderBucket(bySubset);

console.log('\nwrong predictions (4):');
for (const pc of ran.filter((c) => !correctCases.has(c.caseKey))) {
  console.log(
    `  ${pc.caseKey} conf=${pc.predicted?.confidence} [${pc.boundary}] gold=${pc.category} predicted=${pc.predicted?.category}`
  );
}
console.log(`\nboundary: ${boundaryTotal - boundaryWrong.length}/${boundaryTotal} correct (${fmt((boundaryTotal - boundaryWrong.length) / boundaryTotal)})`);
console.log(`core:     ${coreTotal - coreWrong.length}/${coreTotal}     correct (${fmt((coreTotal - coreWrong.length) / coreTotal)})`);
console.log(`wrong on boundary: ${boundaryWrong.map((c) => c.caseKey).join(', ') || '-'}`);
console.log(`wrong on core:     ${coreWrong.map((c) => c.caseKey).join(', ') || '(none)'}`);

console.log(
  `\nconfidence: wrong mean=${fmt(mean(confOfWrong))} median=${fmt(median(confOfWrong))}, ` +
    `correct mean=${fmt(mean(confOfCorrect))} median=${fmt(median(confOfCorrect))}`
);

// Phase 6 audit recomputed from the same stored data (should match its report)
const audit = { matches: 0, over: 0, under: 0, highConfidenceWrong: [] as string[] };
for (const pc of ran) {
  const goldBand = goldOf(pc.caseKey).expectedConfidence;
  const actual = bandOf(pc.predicted?.confidence ?? null);
  if (pc.predicted && pc.predicted.category !== pc.category) {
    const conf = pc.predicted.confidence;
    if (conf !== null && conf >= 0.7) audit.highConfidenceWrong.push(pc.caseKey);
    continue;
  }
  if (actual === null) audit.matches += 1;
  else {
    if (actual === goldBand) audit.matches += 1;
    else {
      const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };
      if (rank[actual] > rank[goldBand]) audit.over += 1;
      else audit.under += 1;
    }
  }
}
console.log('\n=== PHASE 6 AUDIT RECOMPUTED (cross-check vs stored metrics.confidenceAudit) ===');
console.log(JSON.stringify(audit));
const storedAudit = (JSON.parse(readFileSync(join(DOCS, 'phase6-results.json'), 'utf8')) as { metrics: { confidenceAudit: unknown } }).metrics.confidenceAudit;
console.log('stored metrics.confidenceAudit:');
console.log(JSON.stringify(storedAudit));