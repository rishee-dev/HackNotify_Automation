/**
 * Bounded Retry Utility for Source Ingestion.
 *
 * Implements exponential backoff for transient network and API errors.
 * Rejects immediately on non-retriable failures (authentication, configuration, malformed data).
 */

import { logger } from '../../config/logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
  operationName?: string;
}

/** Non-retriable error markers */
const NON_RETRIABLE_INDICATORS = [
  '401',
  '403',
  'unauthorized',
  'forbidden',
  'invalid configuration',
  'unsupported platform',
  'validation failed',
  'not found',
  '404',
];

/**
 * Determines whether an error is transient and safe to retry.
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  for (const indicator of NON_RETRIABLE_INDICATORS) {
    if (msg.includes(indicator)) {
      return false;
    }
  }

  // Network drops, timeouts, 429s, 500s are retriable
  return true;
}

/**
 * Execute an asynchronous operation with bounded retries and exponential backoff.
 */
export async function withSourceRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const initialDelayMs = options.initialDelayMs ?? 200;
  const backoffFactor = options.backoffFactor ?? 2;
  const operationName = options.operationName ?? 'source_operation';

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;

      if (attempt > maxRetries || !isRetriableError(err)) {
        logger.warn('Source operation failed permanently or non-retriable', {
          operation: operationName,
          attempt,
          maxRetries,
          error: err instanceof Error ? err.message : String(err),
          isRetriable: isRetriableError(err),
        });
        throw err;
      }

      logger.warn('Transient source failure, retrying with backoff', {
        operation: operationName,
        attempt,
        maxRetries,
        delayMs: currentDelay,
        error: err instanceof Error ? err.message : String(err),
      });

      await new Promise((resolve) => setTimeout(resolve, currentDelay));
      currentDelay *= backoffFactor;
    }
  }

  throw new Error(`Max retries exhausted for ${operationName}`);
}
