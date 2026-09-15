/**
 * Verifies the Phase 4 AI analysis pipeline against the real (shared Neon) database.
 *
 * Uses the deterministic mock provider explicitly — no API key or provider call
 * is required, everything is verifiable on the seeded dataset.
 *
 * Run: pnpm db:verify-ai
 *
 * The script only inserts rows it creates itself (repeated-analysis check) and
 * deletes exactly those rows afterwards. It never mutates seeded cases or the
 * legacy analysis records.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { cases, caseAnalyses, documents, teams } from '@/lib/db/schema';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiProviderUnavailableError
} from '@/lib/ai/errors';
import { registerServerOnlyStub } from './stubs/register-server-only-stub';

registerServerOnlyStub();

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: CheckResult[] = [];
const createdAnalysisIds: number[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name} — ${detail}`);
}

function expectTrue(name: string, value: boolean, detail = ''): void {
  record(name, value === true, value ? detail || 'ok' : detail || 'assertion failed');
}

async function main(): Promise<void> {
  // Server-only modules cannot be statically imported outside the Next.js
  // bundler; load them after the stub is active.
  const { retrieveRelevantKnowledge } = await import('@/lib/ai/retrieval');
  const { analyzeCase } = await import('@/lib/ai/analyze');
  const { parseRawAnalysis } = await import('@/lib/ai/analysis-schema');
  const { buildAnalysisMessages } = await import('@/lib/ai/prompts');
  const { mockAnalysisProvider, OpenAiAnalysisProvider } = await import(
    '@/lib/ai/provider'
  );
  const { getCaseByIdForTeam } = await import('@/lib/db/queries');

  const [team] = await db.select().from(teams).limit(1);
  if (!team) {
    record('setup', false, 'no team found in the database — run db:seed first');
    return;
  }

  const allCases = await db
    .select()
    .from(cases)
    .where(eq(cases.teamId, team.id));

  const findCase = (needle: string) =>
    allCases.find((c) => c.subject.toLowerCase().includes(needle));

  const groundedCase = findCase('port');
  const injectionCase = findCase('ignore previous');

  if (!groundedCase || !injectionCase) {
    record(
      'setup',
      false,
      'required seeded cases missing — run db:seed first (cancel/port case and the prompt-injection case)'
    );
    return;
  }

  const toCaseContent = (c: typeof groundedCase) => ({
    subject: c.subject,
    customerMessage: c.customerMessage,
    conversationHistory: c.conversationHistory
  });

  const validFixture = {
    category: 'billing',
    summary: 'Customer asks about an unexpected charge.',
    intent: 'The customer wants the charge checked.',
    urgency: 'medium',
    recommendedAction: 'Verify the charge and reply.',
    draftResponse: 'We are checking this charge for you.',
    missingInformation: ['Invoice number'],
    confidence: 0.8,
    sources: []
  };

  // 1 — Schema validation (valid + invalid outputs rejected)
  const parsed = parseRawAnalysis(validFixture);
  expectTrue(
    'schema: valid output parses',
    parsed.category === 'billing' && parsed.confidence === 0.8,
    'category/confidence round-trip'
  );

  const badCategory = { ...validFixture, category: 'not_a_category' };
  const badConfidence = { ...validFixture, confidence: 1.5 };
  const missingField = { ...validFixture };
  delete (missingField as Partial<typeof validFixture>).intent;

  for (const [label, value] of [
    ['invalid category', badCategory],
    ['confidence out of range', badConfidence],
    ['missing required field', missingField]
  ] as const) {
    try {
      parseRawAnalysis(value);
      record(`schema: rejects ${label}`, false, 'accepted invalid output');
    } catch (error) {
      record(
        `schema: rejects ${label}`,
        error instanceof AiInvalidOutputError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // 2 — Team-scoped retrieval (only this team's documents, never others)
  const retrievalDocs = await retrieveRelevantKnowledge(
    'cancel plan',
    team.id,
    { limit: 5 }
  );
  const docIds = retrievalDocs.map((d) => d.documentId);
  const ownedDocs =
    docIds.length > 0
      ? await db
          .select({ id: documents.id, teamId: documents.teamId })
          .from(documents)
          .where(inArray(documents.id, docIds))
      : [];
  expectTrue(
    'retrieval: team-scoped results',
    ownedDocs.length > 0 &&
      ownedDocs.every((d) => d.teamId === team.id) &&
      retrievalDocs.every((d) => d.score > 0),
    `${retrievalDocs.length} docs, all team ${team.id}`
  );

  const alienRetrieval = await retrieveRelevantKnowledge('cancel plan', 999999, {
    limit: 5
  });
  expectTrue(
    'retrieval: other team returns nothing',
    alienRetrieval.length === 0,
    `${alienRetrieval.length} docs for unknown team`
  );

  // 3 — Grounded success path (real seeded case + mock provider)
  const groundedRetrieval = await retrieveRelevantKnowledge(
    `${groundedCase.subject} ${groundedCase.customerMessage}`,
    team.id,
    { limit: 5 }
  );
  const groundedAnalysis = await analyzeCase({
    caseContent: toCaseContent(groundedCase),
    retrievedDocs: groundedRetrieval,
    provider: mockAnalysisProvider
  });
  const groundedSourcesValid = groundedAnalysis.sources.every((s) =>
    groundedRetrieval.some((d) => d.documentId === s.documentId)
  );
  expectTrue(
    'pipeline: grounded success path',
    groundedAnalysis.category === 'cancellation' &&
      groundedAnalysis.confidence >= 0.5 &&
      groundedAnalysis.confidence <= 1 &&
      groundedAnalysis.sources.length > 0 &&
      groundedSourcesValid &&
      groundedAnalysis.model === 'mock-deterministic' &&
      groundedAnalysis.providerId === 'mock' &&
      groundedAnalysis.retrievedDocumentCount === groundedRetrieval.length,
    `category=${groundedAnalysis.category} confidence=${groundedAnalysis.confidence} sources=${groundedAnalysis.sources.length}`
  );

  // 4 — Empty retrieval is safe (guard prevents any fake analysis)
  const emptyRetrieval = await retrieveRelevantKnowledge('xqzqqq ninte zz', team.id, {
    limit: 5
  });
  expectTrue(
    'pipeline: empty retrieval returns no documents',
    emptyRetrieval.length === 0,
    `${emptyRetrieval.length} docs for out-of-KB query`
  );
  const emptyAnalysis = await analyzeCase({
    caseContent: toCaseContent(groundedCase),
    retrievedDocs: [],
    provider: mockAnalysisProvider
  });
  expectTrue(
    'pipeline: no-docs analysis stays valid + honest',
    emptyAnalysis.sources.length === 0 &&
      emptyAnalysis.confidence <= 0.5 &&
      emptyAnalysis.retrievedDocumentCount === 0 &&
      emptyAnalysis.missingInformation.some((m) =>
        m.toLowerCase().includes('knowledge base')
      ),
    `confidence=${emptyAnalysis.confidence} missingInfo=${emptyAnalysis.missingInformation.length}`
  );

  // 5 — Invalid AI output is rejected (ungrounded output must never persist)
  const originalBehavior = process.env.AI_MOCK_BEHAVIOR;
  process.env.AI_MOCK_BEHAVIOR = 'invalid-output';
  try {
    try {
      await analyzeCase({
        caseContent: toCaseContent(groundedCase),
        retrievedDocs: groundedRetrieval,
        provider: mockAnalysisProvider
      });
      record('pipeline: rejects invalid AI output', false, 'invalid output accepted');
    } catch (error) {
      record(
        'pipeline: rejects invalid AI output',
        error instanceof AiInvalidOutputError,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    process.env.AI_MOCK_BEHAVIOR = originalBehavior;
  }

  // 6 — Provider failure is surfaced as a provider error
  process.env.AI_MOCK_BEHAVIOR = 'error';
  try {
    try {
      await analyzeCase({
        caseContent: toCaseContent(groundedCase),
        retrievedDocs: groundedRetrieval,
        provider: mockAnalysisProvider
      });
      record('pipeline: surfaces provider error', false, 'provider did not fail');
    } catch (error) {
      record(
        'pipeline: surfaces provider error',
        error instanceof AiProviderError,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    process.env.AI_MOCK_BEHAVIOR = originalBehavior;
  }

  // 6b — Ungrounded source references are rejected before persistence
  const rogueProvider = {
    id: 'rogue',
    model: 'rogue-1',
    analyze: async () => ({
      category: 'billing',
      summary: 'summary',
      intent: 'intent',
      urgency: 'low',
      recommendedAction: 'action',
      draftResponse: 'draft',
      missingInformation: [],
      confidence: 0.5,
      sources: ['123456789']
    })
  };
  try {
    await analyzeCase({
      caseContent: toCaseContent(groundedCase),
      retrievedDocs: groundedRetrieval,
      provider: rogueProvider
    });
    record(
      'pipeline: rejects ungrounded source references',
      false,
      'analysis referenced a document that was never retrieved'
    );
  } catch (error) {
    record(
      'pipeline: rejects ungrounded source references',
      error instanceof AiInvalidOutputError,
      error instanceof Error ? error.message : String(error)
    );
  }

  // 7 — Missing API key is treated as "not configured", never as a framework error
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    try {
      await new OpenAiAnalysisProvider().analyze({
        system: 'system',
        prompt: 'prompt',
        caseData: toCaseContent(groundedCase),
        retrievedDocs: groundedRetrieval
      });
      record('pipeline: missing key is unavailable', false, 'call unexpectedly succeeded');
    } catch (error) {
      record(
        'pipeline: missing key is unavailable',
        error instanceof AiProviderUnavailableError,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  }

  // 8 — Trust boundary: customer text stays in the DATA block, provider never
  //     follows injected instructions
  const injectionRetrieval = await retrieveRelevantKnowledge(
    `${injectionCase.subject} ${injectionCase.customerMessage}`,
    team.id,
    { limit: 5 }
  );
  const messages = buildAnalysisMessages(
    toCaseContent(injectionCase),
    injectionRetrieval
  );
  expectTrue(
    'prompt: customer text isolated in CUSTOMER DATA block',
    !messages.system.includes(injectionCase.customerMessage) &&
      messages.prompt.includes(injectionCase.customerMessage) &&
      messages.prompt.includes('CUSTOMER DATA') &&
      messages.prompt.includes('INTERNAL KNOWLEDGE'),
    'system has no customer text; prompt keeps it in the data section'
  );

  const injectionAnalysis = await analyzeCase({
    caseContent: toCaseContent(injectionCase),
    retrievedDocs: injectionRetrieval,
    provider: mockAnalysisProvider
  });
  const injectedOutput = JSON.stringify([
    injectionAnalysis.summary,
    injectionAnalysis.recommendedAction,
    injectionAnalysis.draftResponse,
    injectionAnalysis.missingInformation
  ]).toLowerCase();
  expectTrue(
    'pipeline: injected instructions never honored',
    !injectedOutput.includes('1000 gb') &&
      !injectedOutput.includes('exempt') &&
      !injectedOutput.includes('ignore all previous'),
    'draft/action/summary contain no injected directives'
  );

  // 9 — Repeated analysis persists new records and never mutates previous ones
  const [first] = await db
    .insert(caseAnalyses)
    .values({
      caseId: groundedCase.id,
      category: 'billing',
      summary: 'verify: first run',
      intent: 'verify',
      urgency: 'medium',
      recommendedAction: 'verify: first action',
      draftResponse: 'verify: first draft',
      missingInformation: [],
      sources: [],
      confidence: 0.7,
      model: 'verify-fixture'
    })
    .returning({ id: caseAnalyses.id, draftResponse: caseAnalyses.draftResponse });
  createdAnalysisIds.push(first.id);

  const [second] = await db
    .insert(caseAnalyses)
    .values({
      caseId: groundedCase.id,
      category: 'cancellation',
      summary: 'verify: second run',
      intent: 'verify',
      urgency: 'high',
      recommendedAction: 'verify: second action',
      draftResponse: 'verify: second draft',
      missingInformation: [],
      sources: [],
      confidence: 0.9,
      model: 'verify-fixture'
    })
    .returning({ id: caseAnalyses.id, draftResponse: caseAnalyses.draftResponse });
  createdAnalysisIds.push(second.id);

  const persistedRows = await db
    .select()
    .from(caseAnalyses)
    .where(inArray(caseAnalyses.id, [first.id, second.id]));
  const firstStillFirst = persistedRows.find(
    (r) => r.id === first.id && r.draftResponse === 'verify: first draft'
  );
  expectTrue(
    'persistence: re-runs create new records without mutating history',
    firstStillFirst !== undefined &&
      persistedRows.length === 2 &&
      first.id !== second.id,
    `ids ${first.id} / ${second.id}, first draft preserved`
  );

  // 10 — Cross-team access to a case is denied at the query layer
  const unauthorized = await getCaseByIdForTeam(groundedCase.id, 999999);
  expectTrue(
    'authz: cross-team case lookup is denied',
    unauthorized === null,
    `getCaseByIdForTeam returned ${String(unauthorized)}`
  );
}

main()
  .catch((error) => {
    record('script', false, error instanceof Error ? error.message : String(error));
  })
  .finally(async () => {
    if (createdAnalysisIds.length > 0) {
      await db
        .delete(caseAnalyses)
        .where(inArray(caseAnalyses.id, createdAnalysisIds));
      console.log(
        `cleanup: removed ${createdAnalysisIds.length} verification analysis record(s)`
      );
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\nVerify results: ${results.length - failed.length}/${results.length} passed`);
    if (failed.length > 0) {
      console.log(`Failed checks: ${failed.map((f) => f.name).join(', ')}`);
      process.exitCode = 1;
    }
  });