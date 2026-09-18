/**
 * Phase 6 — classification-boundary regression fixtures.
 *
 * Guards the taxonomy boundary examples agreed in docs/PHASE6-TAXONOMY-REVIEW.md
 * §3 and the human-adjudicated gold labels (§2). Any future change to the
 * dataset labels, boundary map or prompt classification rules that contradicts
 * those decisions fails here.
 *
 * Run: pnpm test:unit
 *
 * Same assertion-script convention as source-normalization.test.ts: no test
 * framework, pure tsx, exits non-zero on the first failing check group.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHASE6_CASES,
  PHASE6_RELABELS,
  PHASE6_KEEP_GOLD,
  PHASE6_BOUNDARIES,
  PHASE6_BOUNDARY_VALUES,
  PHASE6_BOUNDARY_FIXTURES,
  type Phase6Boundary
} from '../phase6/dataset';
import type { Category } from '../phase5a/dataset';

const VALID_CATEGORIES: Category[] = [
  'billing',
  'cancellation',
  'activation',
  'technical_issue',
  'general_information'
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

const byKey = new Map(PHASE6_CASES.map((c) => [c.key, c]));

console.log('[phase6-boundaries] human-adjudicated gold labels (§2)');
check('PHASE6_RELABELS is exactly the documented relabel set', () => {
  assert.deepEqual(PHASE6_RELABELS, {
    ev008: 'general_information',
    ev022: 'general_information',
    ev028: 'general_information',
    ev029: 'general_information',
    ev032: 'general_information'
  });
});
check('every relabeled case has adjudicated gold = general_information', () => {
  for (const [key, label] of Object.entries(PHASE6_RELABELS)) {
    assert.equal(label, 'general_information');
    const c = byKey.get(key);
    assert.ok(c, `unknown relabeled key ${key}`);
    assert.equal(c.category, label);
    assert.notEqual(c.originalCategory, label, `${key} should actually change gold`);
  }
});
check('adjudicated gold differs from original ONLY for the relabel set', () => {
  const changed = PHASE6_CASES.filter((c) => c.category !== c.originalCategory)
    .map((c) => c.key)
    .sort();
  assert.deepEqual(changed, Object.keys(PHASE6_RELABELS).sort());
});
check('KEEP cases are untouched (adjudicated == original gold)', () => {
  for (const key of PHASE6_KEEP_GOLD) {
    const c = byKey.get(key);
    assert.ok(c, `unknown kept key ${key}`);
    assert.equal(
      c.category,
      c.originalCategory,
      `${key} must keep original gold ${c.originalCategory}`
    );
  }
});
check('PHASE6_KEEP_GOLD matches the documented confirmations', () => {
  assert.deepEqual(
    [...PHASE6_KEEP_GOLD].sort(),
    [
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
    ].sort()
  );
});

console.log('[phase6-boundaries] dataset integrity');
check('all 42 Phase 5A cases are carried into Phase 6', () => {
  assert.equal(PHASE6_CASES.length, 42);
});
check('every case has a valid category for both gold references', () => {
  for (const c of PHASE6_CASES) {
    assert.ok(
      VALID_CATEGORIES.includes(c.category),
      `${c.key} adjudicated gold ${c.category} is not a valid category`
    );
    assert.ok(
      VALID_CATEGORIES.includes(c.originalCategory),
      `${c.key} original gold ${c.originalCategory} is not a valid category`
    );
  }
});
check('boundary map covers every case with values from the known set', () => {
  assert.equal(Object.keys(PHASE6_BOUNDARIES).length, 42);
  for (const [key, boundary] of Object.entries(PHASE6_BOUNDARIES)) {
    assert.ok(byKey.has(key), `boundary map references unknown key ${key}`);
    assert.ok(
      PHASE6_BOUNDARY_VALUES.includes(boundary),
      `${key}: unknown boundary ${boundary}`
    );
  }
});
check('PHASE6_CASES boundary matches the boundary map', () => {
  for (const c of PHASE6_CASES) {
    assert.equal(c.boundary, PHASE6_BOUNDARIES[c.key], c.key);
  }
});

console.log('[phase6-boundaries] §3 regression fixtures');
check('exactly the 16 agreed fixture examples are present', () => {
  assert.equal(PHASE6_BOUNDARY_FIXTURES.length, 16);
});
check('every fixture has a valid expected category and boundary', () => {
  for (const f of PHASE6_BOUNDARY_FIXTURES) {
    assert.ok(
      VALID_CATEGORIES.includes(f.expectedCategory),
      `${f.phrase}: bad expected category ${f.expectedCategory}`
    );
    assert.ok(
      PHASE6_BOUNDARY_VALUES.includes(f.boundary),
      `${f.phrase}: bad boundary ${f.boundary}`
    );
  }
});
check('linked fixtures match the dataset adjudicated gold', () => {
  const expectedByPhrase: Record<string, Category> = {
    'How much is the Plus plan?': 'general_information',
    'Do you accept PayPal?': 'general_information',
    'Upgrade my plan mid-month': 'general_information',
    'How do I port my number?': 'cancellation',
    'What plans do you offer?': 'general_information',
    'Is my phone eSIM compatible?': 'activation',
    'eSIM on my wifi-only tablet': 'general_information',
    'MY ESIM BROKEN': 'activation',
    'Roaming data in France': 'general_information',
    'Roaming costs outside the EU': 'general_information',
    'Check network problems in my area': 'general_information',
    'I have no signal since yesterday': 'technical_issue',
    'I was charged twice and have no signal': 'technical_issue'
  };
  const linked = PHASE6_BOUNDARY_FIXTURES.filter((f) => f.linkedKey !== null);
  assert.equal(
    linked.length,
    Object.keys(expectedByPhrase).length,
    'linked fixture count mismatch'
  );
  for (const f of linked) {
    const expected = expectedByPhrase[f.phrase];
    assert.ok(expected, `${f.phrase}: not in the agreed fixture-category map`);
    assert.equal(f.expectedCategory, expected, f.phrase);
    const c = byKey.get(f.linkedKey!)!;
    assert.equal(
      c.category,
      f.expectedCategory,
      `${f.linkedKey} adjudicated gold should equal fixture expectation`
    );
  }
});
check('unlinked fixtures carry the agreed §3 categories', () => {
  const expectations: Record<string, Category> = {
    'Why was I charged 20 EUR?': 'billing',
    'How do I activate my eSIM?': 'activation',
    'My eSIM worked before and now stopped working': 'technical_issue'
  };
  const unlinked = PHASE6_BOUNDARY_FIXTURES.filter((f) => f.linkedKey === null);
  assert.equal(unlinked.length, 3);
  for (const f of unlinked) {
    assert.equal(f.expectedCategory, expectations[f.phrase], f.phrase);
  }
});
check('boundary labels on fixtures reflect the recorded classification case', () => {
  for (const f of PHASE6_BOUNDARY_FIXTURES) {
    if (f.linkedKey === null) continue;
    const c = byKey.get(f.linkedKey)!;
    assert.equal(f.boundary, c.boundary, `${f.linkedKey}: fixture boundary mismatch`);
  }
});

console.log('[phase6-boundaries] prompt classification rules');
const promptsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../lib/ai/prompts.ts'),
  'utf8'
);
check('prompt states PRIMARY CUSTOMER INTENT rule', () => {
  assert.match(promptsSource, /PRIMARY CUSTOMER INTENT/);
});
check('prompt states the no-keyword-alone rule', () => {
  assert.ok(
    promptsSource.includes('Never decide a category from an isolated keyword'),
    'missing no-keyword rule'
  );
});
check('prompt covers the four decisive boundary distinctions', () => {
  const rules = [
    'Pure price, plan or payment-method information without a dispute',
    'Explicit leaving or port-out intent outranks a secondary price question',
    'without activation intent',
    'status-page or service-availability information without a reported fault'
  ];
  for (const rule of rules) {
    assert.ok(promptsSource.includes(rule), `missing rule fragment: "${rule}"`);
  }
});

if (failures > 0) {
  console.error(`\n[phase6-boundaries] ${failures} test(s) failed`);
  process.exit(1);
}
console.log('\n[phase6-boundaries] all tests passed');