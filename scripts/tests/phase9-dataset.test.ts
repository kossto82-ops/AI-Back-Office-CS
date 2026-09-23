/**
 * Phase 9 — frozen benchmark dataset invariant tests.
 *
 * Guards the integrity of the experiment design that is FROZEN before any
 * data collection:
 *
 *   1. exactly 21 cases, unique keys, sourceCaseIds 1..21 (seed order)
 *   2. condition split: ai = 11, manual = 10 (balanced, |diff| <= 1)
 *   3. every category present in BOTH conditions with |ai - manual| <= 1
 *   4. injection archetype is single-case and assigned to the ai arm
 *   5. subject prefix helpers and round-trip resolution are consistent
 *   6. every case defines grounding checks and has safe non-empty fragments
 *
 * Run: pnpm test:unit
 */

import assert from 'node:assert/strict';
import {
  P9_BENCHMARK,
  P9_CONDITION_SPLIT,
  EXPERIMENT_SUBJECT_PREFIX,
  experimentSubjectOf,
  isExperimentSubject,
  p9CaseByKey,
  p9CaseBySubject,
  type P9Category
} from '../phase9/dataset';

let failures = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${name}: ${message}`);
  }
}

function categoryOf(category: string): P9Category {
  return category as P9Category;
}

check('benchmark contains exactly 21 cases', () => {
  assert.equal(P9_BENCHMARK.length, 21);
});

check('keys are unique', () => {
  const keys = P9_BENCHMARK.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

check('sourceCaseIds are a permutation of 1..21', () => {
  const ids = P9_BENCHMARK.map((c) => c.sourceCaseId).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: 21 }, (_, i) => i + 1));
});

check('condition split is frozen: ai=11, manual=10', () => {
  assert.equal(P9_CONDITION_SPLIT.ai.length, 11);
  assert.equal(P9_CONDITION_SPLIT.manual.length, 10);
});

check('P9_CONDITION_SPLIT mirrors individual assignments', () => {
  for (const condition of ['ai', 'manual'] as const) {
    const expected = P9_BENCHMARK.filter((c) => c.condition === condition).map(
      (c) => c.sourceCaseId
    );
    assert.deepEqual(
      [...P9_CONDITION_SPLIT[condition]].sort((a, b) => a - b),
      expected.sort((a, b) => a - b)
    );
  }
});

check('every category is balanced within |ai - manual| <= 1', () => {
  const categories = new Map<P9Category, { ai: number; manual: number }>();
  for (const c of P9_BENCHMARK) {
    const cat = categoryOf(c.category);
    const entry = categories.get(cat) ?? { ai: 0, manual: 0 };
    entry[c.condition] += 1;
    categories.set(cat, entry);
  }
  assert.ok(categories.size >= 5, 'at least the five known categories');
  for (const [cat, counts] of categories) {
    const label = `${cat}: ai=${counts.ai} manual=${counts.manual}`;
    assert.ok(Math.abs(counts.ai - counts.manual) <= 1, `unbalanced ${label}`);
    assert.ok(counts.ai + counts.manual >= 2, `category needs both arms ${label}`);
  }
});

check('injection archetype: single case, ai arm, p9-21', () => {
  const injections = P9_BENCHMARK.filter((c) => c.archetype === 'injection');
  assert.equal(injections.length, 1);
  assert.equal(injections[0].key, 'p9-21');
  assert.equal(injections[0].condition, 'ai');
});

check('subject prefix drop/round-trip resolution', () => {
  for (const c of P9_BENCHMARK) {
    const prefixed = experimentSubjectOf(c);
    assert.ok(isExperimentSubject(prefixed), `prefixed subject for ${c.key}`);
    assert.equal(prefixed.startsWith(EXPERIMENT_SUBJECT_PREFIX), true);
    assert.equal(p9CaseBySubject(prefixed)?.key, c.key);
    assert.equal(p9CaseByKey(c.key)?.sourceSubject, c.sourceSubject);
  }
});

check('every case defines grounding checks and pilot guidance', () => {
  for (const c of P9_BENCHMARK) {
    assert.ok(c.expectedUsableDraftChecks.length > 0, `${c.key} has grounding checks`);
    assert.ok(c.pilotGuidance.trim().length > 0, `${c.key} has pilot guidance`);
  }
});

check('banned fragments are non-empty lowercase substrings', () => {
  for (const c of P9_BENCHMARK) {
    for (const fragment of c.bannedFragments) {
      assert.ok(fragment.trim().length > 0, `${c.key} empty fragment`);
      assert.equal(fragment, fragment.toLowerCase(), `${c.key} fragment not lowercase: ${fragment}`);
    }
  }
});

console.log(failures === 0 ? '\nPhase 9 dataset invariants: PASS' : `\nPhase 9 dataset invariants: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);