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