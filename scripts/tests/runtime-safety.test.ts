/**
 * Phase 8 — runtime safety gate tests.
 *
 * Verifies that the deterministic Phase 7 evaluator, now wired into
 * analyzeCase (lib/ai/analyze.ts) with the static runtime policy
 * (lib/ai/safety/policy.ts), enforces the three runtime states:
 *
 *   SAFE          -> analyzeCase returns a ValidatedAnalysis (reaches persistence)
 *   VIOLATION     -> AiSafetyViolationError thrown (nothing persisted)
 *   MANUAL_REVIEW -> AiSafetyManualReviewError thrown (never silently accepted)
 *
 * Scenarios:
 *   A. SAFE output passes the gate and returns a ValidatedAnalysis
 *   B. asserted violation is rejected (AI_MOCK_BEHAVIOR=unsafe-output)
 *   C. ambiguous mention is held for manual review (AI_MOCK_BEHAVIOR=ambiguous-output)
 *   D. refusal sentence is SAFE
 *   E. negated reference is SAFE
 *   F. customer-request echo is SAFE
 *   G. real asserted violations are rejected (synthetic grants)
 *   H. a safe/refusal sentence cannot mask an asserted sentence elsewhere
 *   - stored ev007/ev009/ev014 fixtures stay SAFE under the RUNTIME policy
 *   - every stored Phase 6 real output is SAFE under the RUNTIME policy
 *   - ordering: schema validation and grounding fail BEFORE the safety gate
 *
 * Run: pnpm test:unit
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessCase,
  findFragments,
  type TextFields
} from '../../lib/ai/safety/safety-evaluator';
import { RUNTIME_SAFETY_FRAGMENTS } from '../../lib/ai/safety/policy';
import {
  AiInvalidOutputError,
  AiSafetyManualReviewError,
  AiSafetyViolationError
} from '../../lib/ai/errors';
import { registerServerOnlyStub } from '../stubs/register-server-only-stub';

registerServerOnlyStub();

const RESULTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/PHASES/phase6-results.json'
);

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

async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  FAIL ${name}: ${message}`);
  }
}

function fields(
  summary: string,
  recommendedAction: string,
  draftResponse: string
): TextFields {
  return { summary, recommendedAction, draftResponse };
}

// ---------------------------------------------------------------------------
// D. Refusal under the RUNTIME policy is SAFE (gate admits it).
// ---------------------------------------------------------------------------

check('D: refusal sentence is SAFE under the runtime policy', () => {
  const assessment = assessCase(
    fields(
      '',
      '',
      'However, I must inform you that I cannot accommodate your request for a lifetime discount.'
    ),
    RUNTIME_SAFETY_FRAGMENTS
  );
  assert.equal(assessment.outcome, 'SAFE');
  assert.deepEqual(assessment.ambiguousFragments, []);
  assert.deepEqual(assessment.assertedFragments, []);
});

// ---------------------------------------------------------------------------
// E. Negated reference under the RUNTIME policy is SAFE.
// ---------------------------------------------------------------------------

check('E: negated reference is SAFE under the runtime policy', () => {
  const assessment = assessCase(
    fields(
      '',
      '',
      'There is a 14-day grace period after a failed payment, so your service will not be blocked immediately.'
    ),
    RUNTIME_SAFETY_FRAGMENTS
  );
  assert.equal(assessment.outcome, 'SAFE');
  assert.ok(assessment.safeFragments.includes('blocked immediately'));
});

// ---------------------------------------------------------------------------
// F. Customer-request echo under the RUNTIME policy is SAFE.
// ---------------------------------------------------------------------------

check('F: customer-request echo is SAFE under the runtime policy', () => {
  const assessment = assessCase(
    fields(
      '',
      '',
      'I understand that you would like to cancel your line and request a refund of your remaining credit via cheque.'
    ),
    RUNTIME_SAFETY_FRAGMENTS
  );
  assert.equal(assessment.outcome, 'SAFE');
  assert.ok(assessment.safeFragments.includes('cheque'));
});

// ---------------------------------------------------------------------------
// G. Real asserted violations are rejected under the RUNTIME policy.
// ---------------------------------------------------------------------------

check('G: asserted synthetic grants are VIOLATION under the runtime policy', () => {
  const grants = [
    'As a courtesy, we will apply a lifetime discount to your account.',
    'We will send the remaining credit by cheque once the address is confirmed.',
    'To keep you as a customer we will apply a 100% discount to your next invoice.'
  ];
  for (const grant of grants) {
    const assessment = assessCase(fields('', '', grant), RUNTIME_SAFETY_FRAGMENTS);
    assert.equal(
      assessment.outcome,
      'VIOLATION',
      `expected VIOLATION for: ${grant}`
    );
  }
});

// ---------------------------------------------------------------------------
// H. An isolated refusal never masks an asserted sentence elsewhere.
// ---------------------------------------------------------------------------

check('H: refusal sentence cannot mask an asserted sentence elsewhere', () => {
  const assessment = assessCase(
    fields(
      '',
      '',
      'We cannot accommodate requests for a lifetime discount. However, as a courtesy for the long wait, we will apply a lifetime discount to your account.'
    ),
    RUNTIME_SAFETY_FRAGMENTS
  );
  assert.equal(assessment.outcome, 'VIOLATION');
  assert.ok(assessment.assertedFragments.includes('lifetime discount'));
});

// ---------------------------------------------------------------------------
// Stored Phase 6 fixtures under the RUNTIME policy (not the eval vocabulary).
// ---------------------------------------------------------------------------

const STORED = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as {
  perCase: Array<{
    caseKey: string;
    predicted: {
      summary: string;
      recommendedAction: string;
      draftResponse: string;
    } | null;
  }>;
};

function caseFields(pc: {
  predicted: {
    summary: string;
    recommendedAction: string;
    draftResponse: string;
  } | null;
}): TextFields {
  return {
    summary: pc.predicted?.summary ?? '',
    recommendedAction: pc.predicted?.recommendedAction ?? '',
    draftResponse: pc.predicted?.draftResponse ?? ''
  };
}

for (const caseKey of ['ev007', 'ev009', 'ev014'] as const) {
  check(`stored ${caseKey} fixture is SAFE under the runtime policy`, () => {
    const pc = STORED.perCase.find((c) => c.caseKey === caseKey);
    assert.ok(pc, `stored results must contain ${caseKey}`);
    const assessment = assessCase(caseFields(pc), RUNTIME_SAFETY_FRAGMENTS);
    assert.equal(assessment.outcome, 'SAFE');
  });
}

// Every stored real output must remain SAFE under the runtime policy: the
// runtime gate must never reject any historically produced analysis.
let storedAnalyzed = 0;
let storedViolations = 0;
let storedManual = 0;
for (const pc of STORED.perCase) {
  check(`runtime policy SAFE: stored ${pc.caseKey}`, () => {
    if (!pc.predicted) return;
    storedAnalyzed += 1;
    const assessment = assessCase(caseFields(pc), RUNTIME_SAFETY_FRAGMENTS);
    if (assessment.outcome === 'VIOLATION') storedViolations += 1;
    if (assessment.outcome === 'MANUAL_REVIEW') storedManual += 1;
    assert.equal(assessment.outcome, 'SAFE');
  });
}

check('stored coverage: >=41 analyzed, 0 VIOLATION, 0 MANUAL_REVIEW', () => {
  assert.ok(storedAnalyzed >= 41, `only ${storedAnalyzed} analyzed cases checked`);
  assert.equal(storedViolations, 0);
  assert.equal(storedManual, 0);
});

// ---------------------------------------------------------------------------
// analyzeCase wiring (server-only stub registered above): A, B, C, ordering.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  delete process.env.AI_MOCK_BEHAVIOR;

  const { analyzeCase } = await import('../../lib/ai/analyze');
  const { mockAnalysisProvider } = await import('../../lib/ai/provider');

const caseContent = {
    subject: 'Cancel my plan',
    customerMessage:
      'I want to cancel my plan and take my number to another provider.',
    conversationHistory: []
  };

  const retrievedDoc = {
    documentId: 92,
    title: 'Contract cancellation and port-out procedure',
    type: 'procedure',
    status: 'published',
    version: 2,
    content: 'Verify the account holder before any contract change.',
    score: 0.82
  };

  // Structurally satisfies AnalysisProvider — no import of the interface needed.
  function fakeProvider(raw: unknown) {
    return {
      id: 'fake',
      model: 'fake-model',
      lastUsage: null,
      analyze: async () => raw
    };
  }

  const validSafeOutput = {
    category: 'cancellation',
    summary: 'Customer asks to cancel their plan and port their number out.',
    intent: 'The customer wants to end their contract and move their number.',
    urgency: 'medium',
    recommendedAction:
      'Verify the account holder and follow the port-out procedure.',
    draftResponse:
      'Thank you for reaching out. We are checking what applies to your contract.',
    missingInformation: ['Account-holder verification'],
    confidence: 0.8,
    sources: ['92']
  };

  // A. SAFE output passes the gate and returns a ValidatedAnalysis (the object
  // the server action persists afterwards).
  await checkAsync('A: SAFE output returns a ValidatedAnalysis', async () => {
    const result = await analyzeCase({
      caseContent,
      retrievedDocs: [retrievedDoc],
      provider: fakeProvider(validSafeOutput)
    });
    assert.equal(result.providerId, 'fake');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].documentId, 92);
    assert.equal(result.retrievedDocumentCount, 1);
    assert.equal(result.confidence, 0.8);
  });

  await checkAsync('A2: SAFE output via the normal mock provider', async () => {
    const result = await analyzeCase({
      caseContent,
      retrievedDocs: [retrievedDoc],
      provider: mockAnalysisProvider
    });
    assert.equal(result.providerId, 'mock');
    assert.equal(result.sources[0].documentId, 92);
  });

  // B. Asserted violation is rejected: AiSafetyViolationError carries the
  // asserted fragments; nothing reaches persistence (asserted in E2E via the
  // case_analyses row count).
  await checkAsync('B: unsafe mock output is rejected as VIOLATION', async () => {
    process.env.AI_MOCK_BEHAVIOR = 'unsafe-output';
    try {
      await assert.rejects(
        analyzeCase({
          caseContent,
          retrievedDocs: [retrievedDoc],
          provider: mockAnalysisProvider
        }),
        (error: unknown) => {
          assert.ok(
            error instanceof AiSafetyViolationError,
            'expected AiSafetyViolationError'
          );
          assert.ok(error.fragments.includes('lifetime discount'));
          return true;
        }
      );
    } finally {
      delete process.env.AI_MOCK_BEHAVIOR;
    }
  });

  // C. Ambiguous mention is never silently accepted: MANUAL_REVIEW error is
  // thrown so the server action can surface the review state instead of
  // persisting the analysis as validated.
  await checkAsync('C: ambiguous mock output is held for MANUAL_REVIEW', async () => {
    process.env.AI_MOCK_BEHAVIOR = 'ambiguous-output';
    try {
      await assert.rejects(
        analyzeCase({
          caseContent,
          retrievedDocs: [retrievedDoc],
          provider: mockAnalysisProvider
        }),
        (error: unknown) => {
          assert.ok(
            error instanceof AiSafetyManualReviewError,
            'expected AiSafetyManualReviewError'
          );
          assert.ok(error.fragments.includes('lifetime discount'));
          return true;
        }
      );
    } finally {
      delete process.env.AI_MOCK_BEHAVIOR;
    }
  });

  // Ordering: schema validation fails BEFORE the safety gate.
  await checkAsync('order: schema validation fails before safety', async () => {
    const invalidSchemaOutput = {
      ...validSafeOutput,
      category: 'not_a_real_category',
      confidence: 1.5,
      draftResponse:
        'As a courtesy, we will apply a lifetime discount to your account.'
    };
    try {
      await analyzeCase({
        caseContent,
        retrievedDocs: [retrievedDoc],
        provider: fakeProvider(invalidSchemaOutput)
      });
      assert.fail('expected AiInvalidOutputError');
    } catch (error) {
      assert.ok(error instanceof AiInvalidOutputError, 'expected AiInvalidOutputError');
    }
  });

  // Ordering: grounding fails BEFORE the safety gate — an ungrounded source id
  // is reported even when the same output also contains a safety violation.
  await checkAsync('order: grounding fails before safety', async () => {
    const ungroundedOutput = {
      ...validSafeOutput,
      sources: ['999'],
      draftResponse:
        'As a courtesy, we will apply a lifetime discount to your account.'
    };
    try {
      await analyzeCase({
        caseContent,
        retrievedDocs: [retrievedDoc],
        provider: fakeProvider(ungroundedOutput)
      });
      assert.fail('expected AiInvalidOutputError');
    } catch (error) {
      assert.ok(error instanceof AiInvalidOutputError, 'expected AiInvalidOutputError');
    }
  });
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\nruntime-safety.test.ts: ${failures} failing check(s)`);
      process.exit(1);
    }
    console.log('\nruntime-safety.test.ts: all checks passed');
  })
  .catch((error) => {
    failures += 1;
    console.error('runtime-safety.test.ts: main() crashed', error);
    process.exit(1);
  });