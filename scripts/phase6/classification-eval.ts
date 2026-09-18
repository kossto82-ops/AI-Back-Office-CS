/**
 * Phase 6 — deterministic classification evaluation.
 *
 * Computes the classification-only metrics for the Phase 6 validation from the
 * two real-provider result artifacts:
 *   - docs/phase5a-baseline-results.json  (Phase 5A baseline, original prompt)
 *   - docs/phase6-results.json            (Phase 6, adjudicated gold + new prompt)
 *
 * Both runs use the same model (gpt-4o-mini), the same retrieval/grounding
 * pipeline and the same 42-case dataset; only the gold labels used for scoring
 * and the classification instructions in lib/ai/prompts.ts differ. Scoring
 * against BOTH gold references (original Phase 5A gold and adjudicated Phase 6
 * gold) decomposes the accuracy change into a taxonomy component (all else
 * equal, relabeled gold) and a prompt component (new instructions).
 *
 * Deterministic: no provider calls, no DB. Write-only output artifact:
 *   - docs/phase6-classification-results.json
 *
 * Run: pnpm db:phase6-classify
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASE6_CASES,
  PHASE6_RELABELS,
  PHASE6_KEEP_GOLD,
  PHASE6_BOUNDARY_VALUES,
  type Phase6Boundary
} from './dataset';
import type { Category } from '../phase5a/dataset';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../docs');

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const CATEGORIES: Category[] = [
  'billing',
  'cancellation',
  'activation',
  'technical_issue',
  'general_information'
];

type GoldReference =
  | { label: 'originalGold'; gold: (c: Phase6CaseRow) => Category }
  | { label: 'adjudicatedGold'; gold: (c: Phase6CaseRow) => Category };

type Phase6CaseRow = (typeof PHASE6_CASES)[number];

type PredictionsByKey = Record<
  string,
  { predictedCategory: Category | null; confidence: number | null; erred: boolean }
>;

function loadRun(path: string): PredictionsByKey {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as {
    perCase: Array<{
      caseKey: string;
      predicted: { category: Category | null; confidence: number | null };
      errors: string[];
    }>;
  };
  const map: PredictionsByKey = {};
  for (const pc of doc.perCase) {
    map[pc.caseKey] = {
      predictedCategory: pc.predicted.category,
      confidence: pc.predicted.confidence,
      erred: (pc.errors ?? []).length > 0
    };
  }
  return map;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function evaluateRun(
  label: string,
  sourceFile: string,
  predictions: PredictionsByKey,
  reference: GoldReference
) {
  const ran: string[] = [];
  const correct: string[] = [];
  const casesByGold: Record<string, { correct: number; total: number }> = {};
  const confusion: Record<string, Record<string, number>> = {};
  const boundaries: Record<
    Phase6Boundary,
    { correct: number; total: number }
  > = {} as Record<Phase6Boundary, { correct: number; total: number }>;
  const highConfidenceWrong: string[] = [];
  const skipped: string[] = [];

  for (const c of PHASE6_CASES) {
    const pred = predictions[c.key];
    if (!pred) {
      throw new Error(`${label}: no prediction recorded for ${c.key} in ${sourceFile}`);
    }
    if (pred.erred) {
      skipped.push(c.key);
      continue;
    }
    const gold = reference.gold(c);
    ran.push(c.key);
    casesByGold[gold] ||= { correct: 0, total: 0 };
    casesByGold[gold].total += 1;
    confusion[gold] ||= {};
    confusion[gold][pred.predictedCategory ?? '(none)'] =
      (confusion[gold][pred.predictedCategory ?? '(none)'] ?? 0) + 1;

    if (c.boundary !== 'core') {
      boundaries[c.boundary] ||= { correct: 0, total: 0 };
      boundaries[c.boundary].total += 1;
    }

    if (pred.predictedCategory === gold) {
      correct.push(c.key);
      if (c.boundary !== 'core') boundaries[c.boundary].correct += 1;
      casesByGold[gold].correct += 1;
    } else if (
      pred.confidence !== null &&
      pred.confidence >= HIGH_CONFIDENCE_THRESHOLD
    ) {
      highConfidenceWrong.push(c.key);
    }
  }

  const totalRan = ran.length;
  const retrievable = PHASE6_CASES.length - 1; // ev042 is retrieval-empty by design

  const byCategory = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const row = casesByGold[cat];
      return [
        cat,
        row
          ? {
              correct: row.correct,
              total: row.total,
              accuracy: round4(row.correct / row.total)
            }
          : { correct: 0, total: 0, accuracy: 0 }
      ];
    })
  );

  const boundaryCases = Object.values(boundaries).reduce(
    (a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total }),
    { correct: 0, total: 0 }
  );

  return {
    label,
    sourceFile,
    overall: {
      ran: totalRan,
      skipped,
      correct: correct.length,
      accuracy: round4(totalRan === 0 ? 0 : correct.length / totalRan),
      accuracyOverRetrievable: round4(
        retrievable === 0 ? 0 : correct.length / retrievable
      )
    },
    byCategory,
    confusionMatrix: confusion,
    boundaries: {
      boundaryCasesCovered: boundaryCases.total,
      accuracy: round4(
        boundaryCases.total === 0 ? 0 : boundaryCases.correct / boundaryCases.total
      ),
      byBoundary: Object.fromEntries(
        PHASE6_BOUNDARY_VALUES.filter((b) => b !== 'core').map((b) => [
          b,
          boundaries[b]
            ? {
                correct: boundaries[b].correct,
                total: boundaries[b].total,
                accuracy: round4(boundaries[b].correct / boundaries[b].total)
              }
            : { correct: 0, total: 0, accuracy: 0 }
        ])
      )
    },
    highConfidenceWrong: {
      threshold: HIGH_CONFIDENCE_THRESHOLD,
      count: highConfidenceWrong.length,
      cases: highConfidenceWrong
    }
  };
}

const baselinePredictions = loadRun(join(DOCS, 'phase5a-baseline-results.json'));
const phase6Predictions = loadRun(join(DOCS, 'phase6-results.json'));

const references: GoldReference[] = [
  { label: 'originalGold', gold: (c) => c.originalCategory },
  { label: 'adjudicatedGold', gold: (c) => c.category }
];

const results: {
  phase: string;
  generatedAt: string;
  dataset: {
    total: number;
    relabeled: string[];
    kept: string[];
    boundaries: Record<string, number>;
  };
  references: { originalGold: string; adjudicatedGold: string };
  runs: Record<string, Record<string, unknown>>;
  decomposition: Record<string, number>;
  perCase: Array<{
    caseKey: string;
    archetype: string;
    boundary: Phase6Boundary;
    originalGold: Category;
    adjudicatedGold: Category;
    baselinePredicted: Category | null;
    baselineConfidence: number | null;
    baselineErred: boolean;
    phase6Predicted: Category | null;
    phase6Confidence: number | null;
    phase6Erred: boolean;
    correctVsAdjudicatedBaseline: boolean;
    correctVsAdjudicatedPhase6: boolean;
    correctVsOriginalBaseline: boolean;
    correctVsOriginalPhase6: boolean;
    boundaryCase: boolean;
  }>;
} = {
  phase: '6-classification',
  generatedAt: new Date().toISOString(),
  dataset: {
    total: PHASE6_CASES.length,
    relabeled: Object.keys(PHASE6_RELABELS),
    kept: PHASE6_KEEP_GOLD,
    boundaries: {}
  },
  references: {
    originalGold: 'Phase 5A original gold labels (historical baseline)',
    adjudicatedGold: 'Phase 6 human-adjudicated gold labels'
  },
  runs: {} as Record<string, Record<string, unknown>>,
  decomposition: {},
  perCase: PHASE6_CASES.map((c) => {
    const bp = baselinePredictions[c.key];
    const p6 = phase6Predictions[c.key];
    if (!bp || !p6) {
      throw new Error(`missing prediction row for ${c.key}`);
    }
    return {
      caseKey: c.key,
      archetype: c.archetype,
      boundary: c.boundary,
      originalGold: c.originalCategory,
      adjudicatedGold: c.category,
      baselinePredicted: bp.predictedCategory,
      baselineConfidence: bp.confidence,
      baselineErred: bp.erred,
      phase6Predicted: p6.predictedCategory,
      phase6Confidence: p6.confidence,
      phase6Erred: p6.erred,
      correctVsAdjudicatedBaseline: !bp.erred && bp.predictedCategory === c.category,
      correctVsAdjudicatedPhase6: !p6.erred && p6.predictedCategory === c.category,
      correctVsOriginalBaseline: !bp.erred && bp.predictedCategory === c.originalCategory,
      correctVsOriginalPhase6: !p6.erred && p6.predictedCategory === c.originalCategory,
      boundaryCase: c.boundary !== 'core'
    };
  })
};

const baselineOriginal = evaluateRun(
  'baseline',
  'phase5a-baseline-results.json',
  baselinePredictions,
  references[0]
);
const baselineAdjudicated = evaluateRun(
  'baseline',
  'phase5a-baseline-results.json',
  baselinePredictions,
  references[1]
);
const phase6Original = evaluateRun(
  'phase6',
  'phase6-results.json',
  phase6Predictions,
  references[0]
);
const phase6Adjudicated = evaluateRun(
  'phase6',
  'phase6-results.json',
  phase6Predictions,
  references[1]
);

results.runs = {
  baseline: {
    model: 'gpt-4o-mini',
    prompt: 'Phase 5A prompt (baseline)',
    originalGold: baselineOriginal,
    adjudicatedGold: baselineAdjudicated
  },
  phase6: {
    model: 'gpt-4o-mini',
    prompt: 'Phase 6 prompt (primary-intent + boundary rules)',
    originalGold: phase6Original,
    adjudicatedGold: phase6Adjudicated
  }
};

const a = baselineOriginal.overall.accuracy;
const aPrime = baselineAdjudicated.overall.accuracy;
const b = phase6Adjudicated.overall.accuracy;
const bPrime = phase6Original.overall.accuracy;

results.decomposition = {
  A_baselineVsOriginalGold: round4(a), // published Phase 5A accuracy
  A_prime_baselineVsAdjudicatedGold: round4(aPrime), // taxonomy relabel applied to baseline predictions
  B_phase6VsAdjudicatedGold: round4(b), // taxonomy + prompt
  B_prime_phase6VsOriginalGold: round4(bPrime), // prompt only, historical labels
  taxonomyContribution: round4(aPrime - a),
  promptContribution: round4(b - aPrime),
  totalDelta: round4(b - a)
};

results.dataset.boundaries = PHASE6_CASES.reduce<Record<string, number>>(
  (acc, c) => {
    acc[c.boundary] = (acc[c.boundary] ?? 0) + 1;
    return acc;
  },
  {}
);

const outPath = join(DOCS, 'phase6-classification-results.json');
writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');

console.log('[phase6-classify] wrote docs/phase6-classification-results.json');
console.log('');
console.log('[phase6-classify] classification accuracy');
console.log(
  `  A        baseline  vs original gold  (published 5A): ${a.toFixed(4)}`
);
console.log(
  `  A'       baseline  vs adjudicated   (taxonomy):    ${aPrime.toFixed(4)}`
);
console.log(
  `  B        phase6    vs adjudicated   (final):       ${b.toFixed(4)}`
);
console.log(
  `  B'       phase6    vs original gold (prompt):      ${bPrime.toFixed(4)}`
);
console.log('');
console.log(
  `  taxonomy contribution: ${results.decomposition.taxonomyContribution.toFixed(4)}`
);
console.log(
  `  prompt contribution:   ${results.decomposition.promptContribution.toFixed(4)}`
);
console.log(
  `  total change:          ${results.decomposition.totalDelta.toFixed(4)}`
);