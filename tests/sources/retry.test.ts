import { describe, it, expect, vi } from 'vitest';
import { withSourceRetry, isRetriableError } from '../../src/sources/utils/retry.js';

describe('Retry Utility (withSourceRetry)', () => {
  it('should succeed on first try when no error is thrown', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withSourceRetry(fn, { maxRetries: 2, initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors and succeed if subsequent attempt succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce('recovered');

    const result = await withSourceRetry(fn, {
      maxRetries: 2,
      initialDelayMs: 10,
      backoffFactor: 1.5,
      operationName: 'test_transient_recovery',
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw immediately on non-retriable error (e.g. 401 Unauthorized)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized: Invalid API Token'));

    await expect(withSourceRetry(fn, { maxRetries: 3, initialDelayMs: 10 })).rejects.toThrow(
      '401 Unauthorized',
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately on non-retriable error (e.g. 403 Forbidden)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('403 Forbidden: Access denied to channel'));

    await expect(withSourceRetry(fn, { maxRetries: 3, initialDelayMs: 10 })).rejects.toThrow(
      '403 Forbidden',
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately on invalid configuration error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid configuration: Missing channel URL'));

    await expect(withSourceRetry(fn, { maxRetries: 2, initialDelayMs: 10 })).rejects.toThrow(
      'Invalid configuration',
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retries and throw if transient error persists', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));

    await expect(
      withSourceRetry(fn, { maxRetries: 2, initialDelayMs: 10, backoffFactor: 1 }),
    ).rejects.toThrow('500 Internal Server Error');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should correctly classify errors via isRetriableError', () => {
    expect(isRetriableError(new Error('Network timeout'))).toBe(true);
    expect(isRetriableError(new Error('429 Rate limit exceeded'))).toBe(true);
    expect(isRetriableError(new Error('502 Bad Gateway'))).toBe(true);
    expect(isRetriableError(new Error('401 Unauthorized'))).toBe(false);
    expect(isRetriableError(new Error('403 Forbidden'))).toBe(false);
    expect(isRetriableError(new Error('Validation failed for input'))).toBe(false);
    expect(isRetriableError('non-error object')).toBe(false);
  });
});
