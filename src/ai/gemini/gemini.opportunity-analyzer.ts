/**
 * Gemini-based Opportunity Analyzer.
 *
 * Implements the OpportunityAnalyzer domain interface.
 * Coordinates system prompts, schema generation, Zod validation,
 * and data normalization.
 */

import { GeminiClient } from './gemini.client.js';
import { OPPORTUNITY_EXTRACTION_PROMPT_V1, ANALYZER_VERSION } from './gemini.prompts.js';
import { GeminiExtractionResponseSchema, GEMINI_RESPONSE_SCHEMA } from './gemini.schemas.js';
import { normalizeExtractedOpportunity } from '../../utils/normalization.js';
import { CreateOpportunitySchema } from '../../domain/schemas.js';
import { logger } from '../../config/logger.js';
import { GeminiValidationError } from '../ai.errors.js';
import type { OpportunityAnalyzer, AnalysisResult } from '../../domain/interfaces.js';

export class GeminiOpportunityAnalyzer implements OpportunityAnalyzer {
  public readonly analyzerVersion = ANALYZER_VERSION;
  private readonly client: GeminiClient;

  constructor(client?: GeminiClient) {
    this.client = client ?? new GeminiClient();
  }

  /**
   * Analyzes raw message text using Gemini, validates output schema,
   * normalizes fields, and produces strongly-typed opportunities.
   */
  async analyze(rawText: string, fallbackSourceUrl?: string | null): Promise<AnalysisResult> {
    const trimmed = rawText?.trim();

    if (!trimmed) {
      return {
        opportunities: [],
        confidence: 0,
        isOpportunity: false,
        reasoningSummary: 'Empty source text provided',
        analyzerVersion: this.analyzerVersion,
      };
    }

    logger.info('opportunity_analysis_started', {
      analyzerVersion: this.analyzerVersion,
      contentLength: trimmed.length,
    });

    // 1. Call Gemini with prompt injection defenses and structured responseSchema
    const generationResult = await this.client.generateStructuredContent(
      OPPORTUNITY_EXTRACTION_PROMPT_V1,
      trimmed,
      GEMINI_RESPONSE_SCHEMA,
    );

    // 2. Validate Gemini JSON output with Zod
    const parsed = GeminiExtractionResponseSchema.safeParse(generationResult.data);

    if (!parsed.success) {
      const issueDescriptions = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      logger.error('opportunity_analysis_failed', {
        reason: 'Zod validation failure on Gemini output',
        issues: issueDescriptions,
      });
      throw new GeminiValidationError('Gemini output failed schema validation', issueDescriptions);
    }

    const extraction = parsed.data;

    // 3. Handle non-opportunity messages
    if (!extraction.is_opportunity) {
      logger.info('opportunity_analysis_completed', {
        isOpportunity: false,
        confidence: extraction.confidence,
        reasoningSummary: extraction.reasoning_summary,
        durationMs: generationResult.durationMs,
      });

      return {
        opportunities: [],
        confidence: extraction.confidence,
        isOpportunity: false,
        reasoningSummary: extraction.reasoning_summary,
        analyzerVersion: this.analyzerVersion,
        modelName: generationResult.model,
        rawResponse: generationResult.rawText,
      };
    }

    // 4. Normalize extraction into domain format & compute fingerprint
    const normalized = normalizeExtractedOpportunity(extraction, fallbackSourceUrl);

    // 5. Validate normalized result against domain CreateOpportunitySchema
    const domainValidation = CreateOpportunitySchema.safeParse(normalized);

    if (!domainValidation.success) {
      const issueDescriptions = domainValidation.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      logger.error('opportunity_analysis_failed', {
        reason: 'Domain schema validation failed on normalized opportunity',
        issues: issueDescriptions,
      });
      throw new GeminiValidationError(
        'Normalized opportunity failed domain validation',
        issueDescriptions,
      );
    }

    logger.info('opportunity_analysis_completed', {
      isOpportunity: true,
      category: normalized.category,
      title: normalized.title,
      company: normalized.company,
      confidence: normalized.ai_confidence,
      fingerprint: normalized.opportunity_fingerprint,
      durationMs: generationResult.durationMs,
    });

    return {
      opportunities: [domainValidation.data],
      confidence: normalized.ai_confidence ?? extraction.confidence,
      isOpportunity: true,
      reasoningSummary: extraction.reasoning_summary,
      analyzerVersion: this.analyzerVersion,
      modelName: generationResult.model,
      rawResponse: generationResult.rawText,
    };
  }
}
