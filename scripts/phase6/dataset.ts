/**
 * Phase 6 classification dataset.
 *
 * Derived from the Phase 5A dataset (scripts/phase5a/dataset.ts) without
 * modifying it. Phase 6 overlays the human-adjudicated gold-label decisions
 * documented in docs/PHASE6-TAXONOMY-REVIEW.md:
 *
 *   - RELABEL (adjudicated gold differs from the Phase 5A original gold):
 *       ev008 billing -> general_information
 *       ev022 activation -> general_information
 *       ev028 technical_issue -> general_information
 *       ev029 technical_issue -> general_information
 *       ev032 technical_issue -> general_information
 *
 *   - KEEP original gold (explicitly confirmed by the adjudicator):
 *       ev036/ev037/ev039/ev040 general_information
 *       ev012/ev015/ev016 cancellation
 *       ev021/ev026 activation
 *       ev034 technical_issue
 *
 * Every other case keeps its Phase 5A gold label unchanged.
 *
 * Each case additionally carries the taxonomy "boundary" that is the crux of
 * its classification decision, so classification-only evaluation can report
 * boundary-case accuracy separately from core-category cases. The boundary
 * fixtures in PHASE6_BOUNDARY_FIXTURES are the regression examples agreed in
 * docs/PHASE6-TAXONOMY-REVIEW.md §3; they are guarded by
 * scripts/tests/classification-boundaries.test.ts.
 */

import {
  EVAL_CASES,
  EVAL_DOCUMENTS,
  type Category,
  type EvalCase
} from '../phase5a/dataset';

export { EVAL_DOCUMENTS };

export type Phase6Boundary =
  | 'core'
  | 'billing/general'
  | 'cancellation/general'
  | 'cancellation/billing'
  | 'activation/general'
  | 'activation/technical'
  | 'technical/general'
  | 'mixed/multi-intent';

export const PHASE6_BOUNDARY_VALUES: readonly Phase6Boundary[] = [
  'core',
  'billing/general',
  'cancellation/general',
  'cancellation/billing',
  'activation/general',
  'activation/technical',
  'technical/general',
  'mixed/multi-intent'
];

/** Human-adjudicated relabels (docs/PHASE6-TAXONOMY-REVIEW.md §2). */
export const PHASE6_RELABELS: Record<string, Category> = {
  ev008: 'general_information',
  ev022: 'general_information',
  ev028: 'general_information',
  ev029: 'general_information',
  ev032: 'general_information'
};

/** Cases whose original gold the adjudicator explicitly confirmed (KEEP). */
export const PHASE6_KEEP_GOLD: string[] = [
  'ev012',
  'ev015',
  'ev016',
  'ev021',
  'ev026',
  'ev034',
  'ev036',
  'ev037',
  'ev039',
  'ev040'
];

/**
 * The taxonomy boundary that is decisive for each case.
 * 'core' = squarely within its category, no fuzzy interface involved.
 */
export const PHASE6_BOUNDARIES: Record<string, Phase6Boundary> = {
  ev001: 'core',
  ev002: 'core',
  ev003: 'core',
  ev004: 'core',
  ev005: 'core',
  ev006: 'mixed/multi-intent',
  ev007: 'core',
  ev008: 'billing/general',
  ev009: 'core',
  ev010: 'core',
  ev011: 'core',
  ev012: 'cancellation/general',
  ev013: 'core',
  ev014: 'core',
  ev015: 'cancellation/billing',
  ev016: 'cancellation/billing',
  ev017: 'core',
  ev018: 'mixed/multi-intent',
  ev019: 'core',
  ev020: 'core',
  ev021: 'activation/general',
  ev022: 'activation/general',
  ev023: 'core',
  ev024: 'core',
  ev025: 'core',
  ev026: 'activation/technical',
  ev027: 'technical/general',
  ev028: 'technical/general',
  ev029: 'technical/general',
  ev030: 'core',
  ev031: 'core',
  ev032: 'technical/general',
  ev033: 'core',
  ev034: 'mixed/multi-intent',
  ev035: 'billing/general',
  ev036: 'billing/general',
  ev037: 'billing/general',
  ev038: 'technical/general',
  ev039: 'cancellation/general',
  ev040: 'billing/general',
  ev041: 'core',
  ev042: 'core'
};

export type Phase6EvalCase = EvalCase & {
  /** Phase 5A gold label (unchanged historical reference). */
  originalCategory: Category;
  /** Adjudicated gold label used for Phase 6 evaluation. */
  category: Category;
  boundary: Phase6Boundary;
};

export const PHASE6_CASES: Phase6EvalCase[] = EVAL_CASES.map((gold) => ({
  ...gold,
  originalCategory: gold.category,
  category: PHASE6_RELABELS[gold.key] ?? gold.category,
  boundary: PHASE6_BOUNDARIES[gold.key] ?? 'core'
}));

export type BoundaryFixture = {
  /** Short labeled example (docs/PHASE6-TAXONOMY-REVIEW.md §3). */
  phrase: string;
  /** Adjudicated gold category for this phrase. */
  expectedCategory: Category;
  /** Matching Phase 6 dataset case, when the dataset carries the same example. */
  linkedKey: string | null;
  /** Boundary this example is meant to pin down. */
  boundary: Phase6Boundary;
  note: string;
};

/** Regression fixtures — the agreed §3 examples of the taxonomy boundaries. */
export const PHASE6_BOUNDARY_FIXTURES: BoundaryFixture[] = [
  {
    phrase: 'How much is the Plus plan?',
    expectedCategory: 'general_information',
    linkedKey: 'ev008',
    boundary: 'billing/general',
    note: 'pure price/data catalogue question, no dispute.'
  },
  {
    phrase: 'Why was I charged 20 EUR?',
    expectedCategory: 'billing',
    linkedKey: null,
    boundary: 'billing/general',
    note: 'unexpected charge = billing dispute.'
  },
  {
    phrase: 'Do you accept PayPal?',
    expectedCategory: 'general_information',
    linkedKey: 'ev036',
    boundary: 'billing/general',
    note: 'payment-method availability, no dispute.'
  },
  {
    phrase: 'Upgrade my plan mid-month',
    expectedCategory: 'general_information',
    linkedKey: 'ev037',
    boundary: 'billing/general',
    note: 'plan-change timing, no dispute.'
  },
  {
    phrase: 'How do I port my number?',
    expectedCategory: 'cancellation',
    linkedKey: 'ev012',
    boundary: 'cancellation/general',
    note: 'explicit port-out intent outranks anything else.'
  },
  {
    phrase: 'What plans do you offer?',
    expectedCategory: 'general_information',
    linkedKey: 'ev035',
    boundary: 'billing/general',
    note: 'catalogue question, no intent to switch billing.'
  },
  {
    phrase: 'Is my phone eSIM compatible?',
    expectedCategory: 'activation',
    linkedKey: 'ev021',
    boundary: 'activation/general',
    note: 'activation intent present (preparing to activate).'
  },
  {
    phrase: 'eSIM on my wifi-only tablet',
    expectedCategory: 'general_information',
    linkedKey: 'ev022',
    boundary: 'activation/general',
    note: 'device has no cellular slot; nothing to activate.'
  },
  {
    phrase: 'How do I activate my eSIM?',
    expectedCategory: 'activation',
    linkedKey: null,
    boundary: 'activation/general',
    note: 'performing an activation.'
  },
  {
    phrase: 'MY ESIM BROKEN',
    expectedCategory: 'activation',
    linkedKey: 'ev026',
    boundary: 'activation/technical',
    note: 'failed NEW activation stays activation.'
  },
  {
    phrase: 'My eSIM worked before and now stopped working',
    expectedCategory: 'technical_issue',
    linkedKey: null,
    boundary: 'activation/technical',
    note: 'post-activation degradation on an active line = technical issue.'
  },
  {
    phrase: 'Roaming data in France',
    expectedCategory: 'general_information',
    linkedKey: 'ev028',
    boundary: 'technical/general',
    note: 'roaming allowance info, no fault reported.'
  },
  {
    phrase: 'Roaming costs outside the EU',
    expectedCategory: 'general_information',
    linkedKey: 'ev029',
    boundary: 'technical/general',
    note: 'roaming price info, no fault reported.'
  },
  {
    phrase: 'Check network problems in my area',
    expectedCategory: 'general_information',
    linkedKey: 'ev032',
    boundary: 'technical/general',
    note: 'status-page info request, no fault reported.'
  },
  {
    phrase: 'I have no signal since yesterday',
    expectedCategory: 'technical_issue',
    linkedKey: 'ev027',
    boundary: 'technical/general',
    note: 'active service fault reported.'
  },
  {
    phrase: 'I was charged twice and have no signal',
    expectedCategory: 'technical_issue',
    linkedKey: 'ev034',
    boundary: 'mixed/multi-intent',
    note: 'primary intent is the active service problem.'
  }
];