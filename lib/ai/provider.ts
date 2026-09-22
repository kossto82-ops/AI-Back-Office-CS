import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, NoObjectGeneratedError, zodSchema } from 'ai';
import { rawAnalysisSchema, type RawAnalysis } from './analysis-schema';
import {
  AiInvalidOutputError,
  AiProviderError,
  AiProviderUnavailableError
} from './errors';
import type { CaseContentForAnalysis } from './prompts';
import type { RetrievedDocument } from './retrieval';

export type AnalysisRequest = {
  system: string;
  prompt: string;
  caseData: CaseContentForAnalysis;
  retrievedDocs: RetrievedDocument[];
};

export type ProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export interface AnalysisProvider {
  readonly id: string;
  readonly model: string;
  analyze(request: AnalysisRequest): Promise<unknown>;
  /** Token usage of the most recent analyze() call, if the provider reports it. */
  readonly lastUsage: ProviderUsage | null;
}

export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAiAnalysisProvider implements AnalysisProvider {
  readonly id = 'openai';

  private latestUsage: ProviderUsage | null = null;

  get model(): string {
    return process.env.AI_MODEL || OPENAI_DEFAULT_MODEL;
  }

  get lastUsage(): ProviderUsage | null {
    return this.latestUsage;
  }

  async analyze(request: AnalysisRequest): Promise<unknown> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AiProviderUnavailableError(
        'OPENAI_API_KEY is not configured on the server'
      );
    }

    const baseURL = process.env.OPENAI_BASE_URL || undefined;
    const openai = createOpenAI({ apiKey, baseURL });

    try {
      const result = await generateObject({
        model: openai(this.model),
        schemaName: 'caseAnalysis',
        schema: zodSchema(rawAnalysisSchema),
        system: request.system,
        prompt: request.prompt,
        temperature: 0.2
      });
      this.latestUsage = result.usage
        ? {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0
          }
        : null;
      return result.object;
    } catch (error) {
      if (error instanceof NoObjectGeneratedError) {
        throw new AiInvalidOutputError(
          'The AI provider did not return a valid structured analysis'
        );
      }
      throw new AiProviderError(
        'The AI provider could not complete the request'
      );
    }
  }
}

const MOCK_BEHAVIORS = [
  'normal',
  'error',
  'invalid-output',
  'unsafe-output',
  'ambiguous-output'
] as const;
export type MockBehavior = (typeof MOCK_BEHAVIORS)[number];

function detectCategory(text: string): RawAnalysis['category'] {
  const lower = text.toLowerCase();
  if (/(cancel|\bcancel|port|cancelled|deceased|terminat)/.test(lower)) {
    return 'cancellation';
  }
  if (/(activ|sim|esim|port-in|signal)/.test(lower)) {
    return 'activation';
  }
  if (
    /(data|[^a-z]sms|roaming|dropped|no signal|no\.? (coverage|signal|data)|not (working|arriving|receiving)|stopped working|troubleshoot)/.test(
      lower
    )
  ) {
    return 'technical_issue';
  }
  if (
    /(invoice|billing|charge|fee|refund|promotion|payment|tariff|plan price)/.test(
      lower
    )
  ) {
    return 'billing';
  }
  return 'general_information';
}

function detectUrgency(text: string): RawAnalysis['urgency'] {
  const lower = text.toLowerCase();
  if (
    /(not working|no data|no signal|stopped|blocked|immediate|asap|urgent|deadline|cannot|cant use|until)/.test(
      lower
    )
  ) {
    return 'high';
  }
  if (/(cancel|port|invoice|fee|error|escalat|dispute)/.test(lower)) {
    return 'medium';
  }
  return 'low';
}

function intentFor(category: RawAnalysis['category']): string {
  switch (category) {
    case 'billing':
      return 'The customer wants a charge, fee, or invoice discrepancy on their account checked and corrected.';
    case 'cancellation':
      return 'The customer wants to end their contract or move their number, and to know the consequences and any applicable fees.';
    case 'activation':
      return 'The customer wants their new line, SIM, or eSIM activated or wants to fix an activation problem.';
    case 'technical_issue':
      return 'The customer reports a technical problem with their service and wants it investigated and resolved.';
    default:
      return 'The customer is asking for information or advice before taking an action.';
  }
}

function recommendedActionFor(
  category: RawAnalysis['category'],
  topDoc: RetrievedDocument | null
): string {
  if (!topDoc) {
    return 'Ask the customer for the specific account details needed to take the case further.';
  }
  const reference =
    topDoc.type === 'procedure'
      ? `Follow the knowledge-base procedure "${topDoc.title}" (v${topDoc.version}) step by step.`
      : `Answer based on the knowledge-base entry "${topDoc.title}" (v${topDoc.version}).`;
  return `${reference} Confirm the relevant account details with the customer before acting, and record the outcome. If the case is not resolved, escalate with the case id and the steps already taken.`;
}

function draftFor(category: RawAnalysis['category']): string {
  switch (category) {
    case 'billing':
      return 'Thank you for letting us know about this. We are reviewing the details on your account and will confirm the outcome of our check with you once it is complete. If you can share the order or invoice number involved, it helps us confirm the steps faster.';
    case 'cancellation':
      return 'Thank you for reaching out. We are looking into what applies for your request and will confirm the next steps and, where relevant, the conditions that apply to your contract. We will keep the service unchanged until we have your confirmation.';
    case 'activation':
      return 'Thank you. We are checking the activation status on our side. If you can confirm the order number and the device model you are using, it will help us investigate. We will follow up as soon as we have an update.';
    case 'technical_issue':
      return 'Thank you for the details. We are investigating this issue and will get back to you with the next steps. If you can share the exact device model and what you have already tried, it will help us narrow it down.';
    default:
      return 'Thank you for your question. We would be happy to help. We are confirming the details that apply to your account and will get back to you with an answer.';
  }
}

function summaryFor(
  category: RawAnalysis['category'],
  caseData: CaseContentForAnalysis
): string {
  switch (category) {
    case 'billing':
      return 'The customer reports a charge, fee, or invoice they believe is wrong and asks for it to be checked.';
    case 'cancellation':
      return 'The customer wants to end their contract or move their number elsewhere and needs to know the conditions.';
    case 'activation':
      return 'The customer is trying to get their line, SIM, or eSIM working and wants it activated or fixed.';
    case 'technical_issue':
      return 'The customer reports a technical problem with their service and expects it to be investigated.';
    default:
      return 'The customer is asking for general information or advice and expects a clear answer.';
  }
}

function buildMockAnalysis(
  caseData: CaseContentForAnalysis,
  documents: RetrievedDocument[]
): RawAnalysis {
  const category = detectCategory(
    `${caseData.subject} ${caseData.customerMessage}`
  );
  const urgency = detectUrgency(
    `${caseData.subject} ${caseData.customerMessage}`
  );
  const topDoc = documents[0] ?? null;

  const confidence =
    documents.length === 0
      ? 0.3
      : Math.min(0.95, 0.45 + 0.15 * Math.min(documents.length, 3));

  const sources = documents.slice(0, 3).map((doc) => String(doc.documentId));

  const missingInformation: string[] = [];
  if (category === 'billing') {
    missingInformation.push(
      'The order or invoice number involved in the discrepancy'
    );
  }
  if (category === 'cancellation') {
    missingInformation.push(
      'Account-holder verification before any contract change'
    );
  }
  if (category === 'activation') {
    missingInformation.push('The order number and the device model');
  }
  if (category === 'technical_issue') {
    missingInformation.push(
      'The exact device model and the steps already tried'
    );
  }
  if (documents.length === 0 || confidence < 0.5) {
    missingInformation.push(
      'Confirmation that the knowledge base covers the customer\'s specific situation'
    );
  }

  return {
    category,
    summary: summaryFor(category, caseData),
    intent: intentFor(category),
    urgency,
    recommendedAction: recommendedActionFor(category, topDoc),
    draftResponse: draftFor(category),
    missingInformation: missingInformation.length > 0 ? missingInformation : [],
    confidence,
    sources
  };
}

export class MockAnalysisProvider implements AnalysisProvider {
  readonly id = 'mock';
  readonly model = 'mock-deterministic';
  readonly lastUsage: ProviderUsage | null = null;

  async analyze(request: AnalysisRequest): Promise<unknown> {
    const behavior: MockBehavior =
      (process.env.AI_MOCK_BEHAVIOR as MockBehavior | undefined) ?? 'normal';

    if (behavior === 'error') {
      throw new AiProviderError(
        'Mock provider forced failure (AI_MOCK_BEHAVIOR=error)'
      );
    }

    if (behavior === 'invalid-output') {
      return {
        category: 'not_a_real_category',
        summary: '',
        intent: '',
        urgency: 'critical',
        recommendedAction: '',
        draftResponse: '',
        missingInformation: [],
        confidence: 1.5,
        sources: []
      };
    }

    if (behavior === 'unsafe-output') {
      const analysis = buildMockAnalysis(request.caseData, request.retrievedDocs);
      analysis.draftResponse =
        'Thank you for reaching out. As a courtesy, we will apply a lifetime discount to your account and we will refund your last invoice. Please reach out if anything else comes up.';
      return analysis;
    }

    if (behavior === 'ambiguous-output') {
      const analysis = buildMockAnalysis(request.caseData, request.retrievedDocs);
      analysis.draftResponse =
        'Thank you for reaching out. Our team is looking into whether a lifetime discount could apply to your account. We will follow up once we have checked the details.';
      return analysis;
    }

    return buildMockAnalysis(request.caseData, request.retrievedDocs);
  }
}

export const mockAnalysisProvider = new MockAnalysisProvider();

export function getAnalysisProvider(): AnalysisProvider {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  if (provider === 'mock') {
    return mockAnalysisProvider;
  }
  if (provider === 'openai') {
    return new OpenAiAnalysisProvider();
  }
  throw new AiProviderUnavailableError(
    `Unknown AI_PROVIDER "${provider}". Supported values: openai, mock.`
  );
}