/**
 * Custom error hierarchy for AI opportunity analysis.
 *
 * Designed to cleanly distinguish between configuration errors,
 * transient network issues, rate limits, parsing failures, and
 * validation errors without leaking sensitive API credentials.
 */

export class AiError extends Error {
  public readonly isTransient: boolean;

  constructor(message: string, isTransient = false) {
    super(message);
    this.name = 'AiError';
    this.isTransient = isTransient;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GeminiMissingApiKeyError extends AiError {
  constructor(
    message = 'Gemini API key is not configured. Set GEMINI_API_KEY in environment variables.',
  ) {
    super(message, false);
    this.name = 'GeminiMissingApiKeyError';
  }
}

export class GeminiApiError extends AiError {
  public readonly statusCode?: number;

  constructor(message: string, statusCode?: number, isTransient = false) {
    super(message, isTransient);
    this.name = 'GeminiApiError';
    this.statusCode = statusCode;
  }
}

export class GeminiRateLimitError extends GeminiApiError {
  constructor(message = 'Gemini API rate limit exceeded. Please retry later.') {
    super(message, 429, true);
    this.name = 'GeminiRateLimitError';
  }
}

export class GeminiTimeoutError extends AiError {
  constructor(message = 'Gemini API request timed out.') {
    super(message, true);
    this.name = 'GeminiTimeoutError';
  }
}

export class GeminiResponseParsingError extends AiError {
  public readonly rawText?: string;

  constructor(message: string, rawText?: string) {
    super(message, false);
    this.name = 'GeminiResponseParsingError';
    this.rawText = rawText;
  }
}

export class GeminiValidationError extends AiError {
  public readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message, false);
    this.name = 'GeminiValidationError';
    this.issues = issues;
  }
}
