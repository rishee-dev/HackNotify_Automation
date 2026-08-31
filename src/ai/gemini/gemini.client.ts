/**
 * Gemini API Client Adapter.
 *
 * Wraps @google/genai SDK with timeout handling, bounded retries
 * for transient errors, and domain error translation.
 * Designed to be easily mockable in test suites.
 */

import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  AiError,
  GeminiApiError,
  GeminiRateLimitError,
  GeminiTimeoutError,
  GeminiResponseParsingError,
} from '../ai.errors.js';

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface StructuredGenerationResult {
  rawText: string;
  data: unknown;
  model: string;
  durationMs: number;
}

export class GeminiClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: GeminiClientOptions = {}) {
    const apiKey = options.apiKey || getGeminiApiKey();
    const model = options.model || (process.env.GEMINI_MODEL ?? 'gemini-2.5-flash');

    this.model = model;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 2;

    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Generates structured JSON output using Gemini's responseSchema.
   */
  async generateStructuredContent(
    systemPrompt: string,
    userContent: string,
    responseSchema: unknown,
  ): Promise<StructuredGenerationResult> {
    const startTime = Date.now();
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs);

      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: userContent,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: responseSchema as Record<string, unknown>,
            temperature: 0.1, // low temperature for factual extraction
            abortSignal: abortController.signal,
          },
        });

        clearTimeout(timeoutId);

        const rawText = response.text;
        if (!rawText) {
          throw new GeminiResponseParsingError('Gemini returned an empty text response.');
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch (parseErr: unknown) {
          const msg = parseErr instanceof Error ? parseErr.message : 'Invalid JSON';
          throw new GeminiResponseParsingError(
            `Failed to parse Gemini structured JSON: ${msg}`,
            rawText,
          );
        }

        const durationMs = Date.now() - startTime;

        return {
          rawText,
          data: parsed,
          model: this.model,
          durationMs,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        if (abortController.signal.aborted) {
          throw new GeminiTimeoutError(`Gemini request timed out after ${this.timeoutMs}ms`);
        }

        const isTransient = this.isTransientError(err);

        if (isTransient && attempt <= this.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          logger.warn('Transient Gemini error encountered, retrying...', {
            attempt,
            maxRetries: this.maxRetries,
            backoffMs,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        this.handleError(err);
      }
    }

    throw new GeminiApiError('Max retries exceeded for Gemini generation.', undefined, false);
  }

  private isTransientError(err: unknown): boolean {
    if (err instanceof AiError && err.isTransient) return true;
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota') ||
        msg.includes('resource exhausted') ||
        msg.includes('500') ||
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('fetch failed') ||
        msg.includes('econnreset')
      );
    }
    return false;
  }

  private handleError(err: unknown): never {
    if (err instanceof AiError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : 'Unknown Gemini error';
    const lower = message.toLowerCase();

    if (
      lower.includes('429') ||
      lower.includes('rate limit') ||
      lower.includes('quota') ||
      lower.includes('resource exhausted')
    ) {
      throw new GeminiRateLimitError(`Gemini rate limit exceeded: ${message}`);
    }

    throw new GeminiApiError(`Gemini API call failed: ${message}`, undefined, false);
  }
}
