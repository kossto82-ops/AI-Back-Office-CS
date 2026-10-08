import type { ValidatedAnalysis } from './analyze';

export class AiProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export class AiInvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiInvalidOutputError';
  }
}

export class AiSafetyViolationError extends Error {
  readonly fragments: string[];

  constructor(message: string, fragments: string[] = []) {
    super(message);
    this.name = 'AiSafetyViolationError';
    this.fragments = fragments;
  }
}

export class AiSafetyManualReviewError extends Error {
  readonly fragments: string[];
  /**
   * The schema-valid, grounded analysis that was held. It is NEVER treated as
   * validated: callers may only persist it with safety_status = 'manual_review'
   * so a human sees it with the flagged wording highlighted.
   */
  readonly analysis?: ValidatedAnalysis;

  constructor(
    message: string,
    fragments: string[] = [],
    analysis?: ValidatedAnalysis
  ) {
    super(message);
    this.name = 'AiSafetyManualReviewError';
    this.fragments = fragments;
    this.analysis = analysis;
  }
}