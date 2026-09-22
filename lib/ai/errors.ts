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

  constructor(message: string, fragments: string[] = []) {
    super(message);
    this.name = 'AiSafetyManualReviewError';
    this.fragments = fragments;
  }
}