import 'server-only';
import { parseRawAnalysis, type RawAnalysis } from './analysis-schema';
import { buildAnalysisMessages, type CaseContentForAnalysis } from './prompts';
import {
  getAnalysisProvider,
  type AnalysisProvider
} from './provider';
import type { RetrievedDocument } from './retrieval';
import { resolveSources, type AnalysisSourceRef } from './source-ids';
import { assessCase, type TextFields } from './safety/safety-evaluator';
import { RUNTIME_SAFETY_FRAGMENTS } from './safety/policy';
import {
  AiSafetyManualReviewError,
  AiSafetyViolationError
} from './errors';

export type { AnalysisSourceRef } from './source-ids';

export type ValidatedAnalysis = {
  category: RawAnalysis['category'];
  summary: string;
  intent: string;
  urgency: RawAnalysis['urgency'];
  recommendedAction: string;
  draftResponse: string;
  missingInformation: string[];
  confidence: number;
  sources: AnalysisSourceRef[];
  model: string;
  providerId: string;
  retrievedDocumentCount: number;
};

export type AnalyzeCaseInput = {
  caseContent: CaseContentForAnalysis;
  retrievedDocs: RetrievedDocument[];
  provider?: AnalysisProvider;
};

export async function analyzeCase(
  input: AnalyzeCaseInput
): Promise<ValidatedAnalysis> {
  const provider = input.provider ?? getAnalysisProvider();
  const { system, prompt } = buildAnalysisMessages(
    input.caseContent,
    input.retrievedDocs
  );

  const raw = await provider.analyze({
    system,
    prompt,
    caseData: input.caseContent,
    retrievedDocs: input.retrievedDocs
  });

  const parsed = parseRawAnalysis(raw);
  const sources = resolveSources(parsed, input.retrievedDocs);

  const safety = assessCase(
    {
      summary: parsed.summary,
      recommendedAction: parsed.recommendedAction,
      draftResponse: parsed.draftResponse
    } satisfies TextFields,
    RUNTIME_SAFETY_FRAGMENTS
  );

  if (safety.outcome === 'VIOLATION') {
    throw new AiSafetyViolationError(
      'AI output contains a confirming reference to a prohibited commitment',
      safety.assertedFragments
    );
  }

  if (safety.outcome === 'MANUAL_REVIEW') {
    throw new AiSafetyManualReviewError(
      'AI output requires human review before it can be accepted',
      safety.ambiguousFragments
    );
  }

  return {
    category: parsed.category,
    summary: parsed.summary,
    intent: parsed.intent,
    urgency: parsed.urgency,
    recommendedAction: parsed.recommendedAction,
    draftResponse: parsed.draftResponse,
    missingInformation: parsed.missingInformation,
    confidence: parsed.confidence,
    sources,
    model: provider.model,
    providerId: provider.id,
    retrievedDocumentCount: input.retrievedDocs.length
  };
}