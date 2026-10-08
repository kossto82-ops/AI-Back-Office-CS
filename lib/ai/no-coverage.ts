/**
 * Deterministic result for a case whose text matches nothing in the team's
 * knowledge base. No model is called: the model cannot ground an answer, and
 * the product principle is explicit uncertainty over invented policy. The
 * agent still gets a concrete next step instead of an error.
 *
 * It is stored like any analysis but is recognisable by `model`, carries no
 * category, urgency, sources or confidence, and its draft is a neutral
 * acknowledgement that makes no promise about outcome, price or timing.
 */
export const NO_COVERAGE_MODEL = 'no-coverage-escalation';

export type NoCoverageAnalysis = {
  summary: string;
  intent: string;
  recommendedAction: string;
  draftResponse: string;
  missingInformation: string[];
};

export function buildNoCoverageAnalysis(): NoCoverageAnalysis {
  return {
    summary:
      'No document in the knowledge base matches this request, so no grounded analysis could be produced.',
    intent: 'Not determined: there is no internal knowledge to ground an interpretation.',
    recommendedAction:
      'Handle this case manually or escalate it to a team lead. If this type of request will recur, add a knowledge document that covers it and re-run the analysis.',
    draftResponse:
      'Thank you for contacting us. We have received your request and are reviewing it. We will get back to you as soon as we have an answer.',
    missingInformation: [
      'Internal knowledge (procedure, FAQ or guide) that covers this request'
    ]
  };
}
