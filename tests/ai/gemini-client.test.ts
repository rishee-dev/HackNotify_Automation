/**
 * Tests for GeminiClient adapter with mocked GoogleGenAI SDK.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiClient } from '../../src/ai/gemini/gemini.client.js';
import {
  GeminiResponseParsingError,
  GeminiRateLimitError,
  GeminiTimeoutError,
} from '../../src/ai/ai.errors.js';

// Mock the @google/genai module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      public models = {
        generateContent: vi.fn(),
      };
    },
  };
});

describe('GeminiClient', () => {
  let client: GeminiClient;
  let mockGenerateContent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new GeminiClient({
      apiKey: 'test-api-key',
      model: 'gemini-2.5-flash',
      timeoutMs: 5000,
      maxRetries: 1,
    });
    // Access the mocked generateContent method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGenerateContent = (client as any).client.models.generateContent;
  });

  it('should successfully parse structured JSON response from Gemini', async () => {
    const mockPayload = {
      is_opportunity: true,
      title: 'Backend Intern',
      category: 'internship',
      confidence: 0.95,
    };

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(mockPayload),
    });

    const result = await client.generateStructuredContent('System prompt', 'User message text', {});

    expect(result.data).toEqual(mockPayload);
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should throw GeminiResponseParsingError when Gemini returns empty text', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: '',
    });

    await expect(client.generateStructuredContent('prompt', 'content', {})).rejects.toThrow(
      GeminiResponseParsingError,
    );
  });

  it('should throw GeminiResponseParsingError when Gemini returns malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'This is not valid JSON { broken',
    });

    await expect(client.generateStructuredContent('prompt', 'content', {})).rejects.toThrow(
      GeminiResponseParsingError,
    );
  });

  it('should retry on transient rate limit (429) errors and succeed if retry succeeds', async () => {
    const mockPayload = { is_opportunity: false, confidence: 0.1 };

    mockGenerateContent
      .mockRejectedValueOnce(new Error('429 Resource Exhausted / Rate limit exceeded'))
      .mockResolvedValueOnce({
        text: JSON.stringify(mockPayload),
      });

    const result = await client.generateStructuredContent('prompt', 'content', {});
    expect(result.data).toEqual(mockPayload);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('should throw GeminiRateLimitError after exhausting retries on 429', async () => {
    mockGenerateContent.mockRejectedValue(new Error('429 Resource Exhausted: Quota exceeded'));

    await expect(client.generateStructuredContent('prompt', 'content', {})).rejects.toThrow(
      GeminiRateLimitError,
    );
  });

  it('should throw GeminiTimeoutError when request aborts due to timeout', async () => {
    const shortClient = new GeminiClient({
      apiKey: 'test-key',
      timeoutMs: 20,
      maxRetries: 0,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shortMock = (shortClient as any).client.models.generateContent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shortMock.mockImplementation((params: any) => {
      const signal = params?.config?.abortSignal as AbortSignal | undefined;
      return new Promise((_, reject) => {
        if (signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    await expect(shortClient.generateStructuredContent('prompt', 'content', {})).rejects.toThrow(
      GeminiTimeoutError,
    );
  });
});
