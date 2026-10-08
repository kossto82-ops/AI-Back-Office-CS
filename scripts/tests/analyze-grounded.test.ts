/**
 * analyzeCase with the grounded-commitment check and the draft-only generic tier,
 * driven by a stub provider (no network). Run: pnpm test:unit
 */
import assert from 'node:assert/strict';
import { registerServerOnlyStub } from '../stubs/register-server-only-stub';

registerServerOnlyStub();

let failures = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const DOC = {
  documentId: 1,
  title: 'Plan Cancellation and Port-Out Procedure',
  type: 'procedure',
  status: 'active',
  version: 2,
  content:
    'The notice period is 30 days. The early termination fee is 60% of the remaining contract months, capped at 90 EUR.',
  score: 5
};

function raw(overrides: Record<string, unknown>) {
  return {
    category: 'cancellation',
    summary: 'The customer wants to cancel.',
    intent: 'Cancel the plan.',
    urgency: 'low',
    recommendedAction: 'Confirm identity and explain the notice period.',
    draftResponse: 'Thank you for reaching out. We are looking into your request.',
    missingInformation: [],
    confidence: 0.8,
    sources: ['1'],
    ...overrides
  };
}

function provider(output: unknown) {
  return {
    id: 'stub',
    model: 'stub-model',
    lastUsage: null,
    analyze: async () => output
  };
}

const caseContent = {
  subject: 'Cancel my plan',
  customerMessage: 'I am moving abroad with 10 months left and want to cancel. Please waive the fee.',
  conversationHistory: []
};

console.log('analyzeCase grounded gate');

(async () => {
  const { analyzeCase } = await import('../../lib/ai/analyze');
  const { AiSafetyManualReviewError } = await import('../../lib/ai/errors');

  const run = (output: unknown) =>
    analyzeCase({ caseContent, retrievedDocs: [DOC], provider: provider(output) as never });

  await check('an invented amount in the draft is held for review, with the analysis attached', async () => {
    await assert.rejects(
      run(raw({ draftResponse: 'The early termination fee is 60% of the remaining months. In your case that would amount to 54 EUR.' })),
      (error: unknown) => {
        assert.ok(error instanceof AiSafetyManualReviewError);
        assert.ok(error.fragments.some((f) => f.includes('54 eur')), error.fragments.join('|'));
        assert.ok(error.analysis);
        return true;
      }
    );
  });

  await check('figures that are in the knowledge pass', async () => {
    const result = await run(raw({ draftResponse: 'The notice period is 30 days and the termination fee is capped at 90 EUR.' }));
    assert.equal(result.category, 'cancellation');
  });

  await check('the customer\'s own figure is not a commitment', async () => {
    await run(raw({ draftResponse: 'I understand you have 10 months left on your contract.' }));
  });

  await check('an unsupported firm remedy promise is held', async () => {
    await assert.rejects(
      run(raw({ draftResponse: 'We will waive the early termination fee for you.' })),
      (error: unknown) => error instanceof AiSafetyManualReviewError
    );
  });

  await check('regression cc03: the summary restating the customer\'s request is not a promise', async () => {
    const result = await run(
      raw({
        summary: 'The customer is moving abroad and requests to waive the early termination fee.',
        recommendedAction: 'Explain that the fee cannot be waived without a lead\'s approval.',
        draftResponse: 'Thank you for reaching out. Please note the early termination fee is 60% of the remaining months, capped at 90 EUR.'
      })
    );
    assert.equal(result.category, 'cancellation');
  });

  if (failures > 0) {
    console.error(`\nanalyze-grounded.test.ts: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nanalyze-grounded.test.ts: all checks passed');
})();
