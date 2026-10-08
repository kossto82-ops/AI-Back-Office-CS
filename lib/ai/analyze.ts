import 'server-only';
import { parseRawAnalysis, type RawAnalysis } from './analysis-schema';
import { buildAnalysisMessages, type CaseContentForAnalysis } from './prompts';
import {
  getAnalysisProvider,
  type AnalysisProvider,
  type ProviderUsage
} from './provider';
import type { RetrievedDocument } from './retrieval';
import { resolveSources, type AnalysisSourceRef } from './source-ids';
import { assessCase, type TextFields } from './safety/safety-evaluator';
import {
  RUNTIME_REVIEW_FRAGMENTS,
  RUNTIME_SAFETY_FRAGMENTS
} from './safety/policy';
import { findUnsupportedCommitments } from './safety/grounded-commitments';
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
  usage: ProviderUsage | null;
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

  const textFields = {
    summary: parsed.summary,
    recommendedAction: parsed.recommendedAction,
    draftResponse: parsed.draftResponse
  } satisfies TextFields;

  const result: ValidatedAnalysis = {
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
    usage: provider.lastUsage,
    retrievedDocumentCount: input.retrievedDocs.length
  };

  const safety = assessCase(textFields, RUNTIME_SAFETY_FRAGMENTS);

  if (safety.outcome === 'VIOLATION') {
    throw new AiSafetyViolationError(
      'AI output contains a confirming reference to a prohibited commitment',
      safety.assertedFragments
    );
  }

  // Generic commitment shapes: review tier only. A hit (asserted or ambiguous)
  // holds the analysis for a human; it never hard-rejects.
  // Scope: the customer-facing draft only. The summary and recommended action are
  // written for the agent and routinely restate what the customer asked for
  // ("requests to waive the early termination fee"), which is not a promise.
  const review = assessCase(
    { summary: '', recommendedAction: '', draftResponse: parsed.draftResponse },
    RUNTIME_REVIEW_FRAGMENTS
  );

  // Figures and remedies the retrieved knowledge does not support.
  const customerText = [
    input.caseContent.subject,
    input.caseContent.customerMessage,
    ...input.caseContent.conversationHistory.map((turn) => turn.content)
  ].join(' ');
  const ungrounded = findUnsupportedCommitments({
    draftResponse: parsed.draftResponse,
    caseText: customerText,
    docs: input.retrievedDocs
  });

  const reviewFragments = [
    ...safety.ambiguousFragments,
    ...review.assertedFragments,
    ...review.ambiguousFragments,
    ...ungrounded.map((finding) => finding.sentence)
  ];

  if (safety.outcome === 'MANUAL_REVIEW' || reviewFragments.length > 0) {
    throw new AiSafetyManualReviewError(
      'AI output requires human review before it can be accepted',
      [...new Set(reviewFragments)],
      result
    );
  }

  return result;
}