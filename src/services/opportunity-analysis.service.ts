/**
 * Opportunity Analysis Orchestration Service.
 *
 * Coordinates the full Phase 2 processing pipeline:
 *  1. Load & claim pending source messages.
 *  2. Analyze raw content with OpportunityAnalyzer (Gemini).
 *  3. Validate & normalize structured opportunity fields.
 *  4. Compute deterministic fingerprints.
 *  5. Detect cross-source duplicate opportunities.
 *  6. Persist opportunities and safely update processing states.
 */

import { SourceMessagesRepository } from '../database/repositories/source-messages.repository.js';
import { OpportunitiesRepository } from '../database/repositories/opportunities.repository.js';
import { GeminiOpportunityAnalyzer } from '../ai/gemini/gemini.opportunity-analyzer.js';
import { logger } from '../config/logger.js';
import type { OpportunityAnalyzer } from '../domain/interfaces.js';

export type ProcessingResultStatus =
  'created' | 'duplicate' | 'non_opportunity' | 'skipped' | 'failed';

export interface ProcessMessageResult {
  sourceMessageId: string;
  status: ProcessingResultStatus;
  opportunityId?: string;
  isDuplicate?: boolean;
  confidence?: number;
  fingerprint?: string;
  reason?: string;
  error?: string;
}

export interface ProcessMessageOptions {
  allowRetry?: boolean;
}

export class OpportunityAnalysisService {
  private readonly sourceMessagesRepo: SourceMessagesRepository;
  private readonly opportunitiesRepo: OpportunitiesRepository;
  private readonly analyzer: OpportunityAnalyzer;

  constructor(
    sourceMessagesRepo?: SourceMessagesRepository,
    opportunitiesRepo?: OpportunitiesRepository,
    analyzer?: OpportunityAnalyzer,
  ) {
    this.sourceMessagesRepo = sourceMessagesRepo ?? new SourceMessagesRepository();
    this.opportunitiesRepo = opportunitiesRepo ?? new OpportunitiesRepository();
    this.analyzer = analyzer ?? new GeminiOpportunityAnalyzer();
  }

  /**
   * Process a single source message through the AI extraction pipeline.
   */
  async processSourceMessage(
    messageId: string,
    options: ProcessMessageOptions = {},
  ): Promise<ProcessMessageResult> {
    const startTime = Date.now();

    // 1. Load source message
    const message = await this.sourceMessagesRepo.getMessageById(messageId);

    if (!message) {
      logger.error('Source message not found for processing', { messageId });
      return {
        sourceMessageId: messageId,
        status: 'failed',
        error: `Source message with ID ${messageId} does not exist.`,
      };
    }

    // 2. Safe processing state machine check
    if (message.processed || message.processing_status === 'processed') {
      if (!options.allowRetry) {
        logger.info('Source message already processed, skipping', {
          messageId,
          status: message.processing_status,
        });
        return {
          sourceMessageId: messageId,
          status: 'skipped',
          reason: 'Message has already been processed.',
        };
      }
    }

    if (message.processing_status === 'processing' && !options.allowRetry) {
      logger.warn('Source message is currently being processed by another worker', {
        messageId,
      });
      return {
        sourceMessageId: messageId,
        status: 'skipped',
        reason: 'Message is currently locked for processing.',
      };
    }

    // 3. Claim/lock message for processing
    try {
      await this.sourceMessagesRepo.markMessageProcessing(messageId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Database lock error';
      logger.error('Failed to claim message for processing', { messageId, error: msg });
      return {
        sourceMessageId: messageId,
        status: 'failed',
        error: `Failed to claim message: ${msg}`,
      };
    }

    // 4. Validate raw text existence
    const rawText = message.raw_text?.trim();
    if (!rawText) {
      const errorMsg = 'Source message raw_text is empty or missing';
      await this.sourceMessagesRepo.markMessageFailed(messageId, errorMsg);
      logger.warn('Marked message failed due to empty text', { messageId });
      return {
        sourceMessageId: messageId,
        status: 'failed',
        error: errorMsg,
      };
    }

    // 5. Run AI analysis
    try {
      const analysis = await this.analyzer.analyze(rawText, message.source_url);

      // 6. Handle non-opportunity messages
      if (!analysis.isOpportunity || analysis.opportunities.length === 0) {
        await this.sourceMessagesRepo.markMessageProcessed(messageId);

        logger.info('source_message_processed', {
          source_message_id: messageId,
          source_channel_id: message.source_channel_id,
          isOpportunity: false,
          confidence: analysis.confidence,
          durationMs: Date.now() - startTime,
        });

        return {
          sourceMessageId: messageId,
          status: 'non_opportunity',
          confidence: analysis.confidence,
          reason: analysis.reasoningSummary || 'Classified as not an opportunity.',
        };
      }

      // 7. Extract opportunity candidate & check duplicates
      const candidate = analysis.opportunities[0];
      candidate.source_message_id = messageId;

      if (!candidate.opportunity_fingerprint) {
        throw new Error('Opportunity candidate missing deterministic fingerprint.');
      }

      // Duplicate check
      const existing = await this.opportunitiesRepo.findOpportunityByFingerprint(
        candidate.opportunity_fingerprint,
      );

      if (existing) {
        await this.sourceMessagesRepo.markMessageProcessed(messageId);

        logger.info('opportunity_duplicate_detected', {
          source_message_id: messageId,
          source_channel_id: message.source_channel_id,
          existing_opportunity_id: existing.id,
          fingerprint: candidate.opportunity_fingerprint,
          durationMs: Date.now() - startTime,
        });

        return {
          sourceMessageId: messageId,
          status: 'duplicate',
          opportunityId: existing.id,
          isDuplicate: true,
          fingerprint: candidate.opportunity_fingerprint,
          confidence: candidate.ai_confidence ?? analysis.confidence,
          reason: 'Duplicate opportunity detected via deterministic fingerprint.',
        };
      }

      // 8. Create new opportunity
      const insertPayload = {
        ...candidate,
        deadline:
          candidate.deadline instanceof Date
            ? candidate.deadline.toISOString()
            : (candidate.deadline ?? null),
      };
      const created = await this.opportunitiesRepo.createOpportunity(insertPayload);
      await this.sourceMessagesRepo.markMessageProcessed(messageId);

      logger.info('source_message_processed', {
        source_message_id: messageId,
        source_channel_id: message.source_channel_id,
        opportunity_id: created.id,
        category: created.category,
        confidence: created.ai_confidence,
        fingerprint: created.opportunity_fingerprint,
        durationMs: Date.now() - startTime,
      });

      return {
        sourceMessageId: messageId,
        status: 'created',
        opportunityId: created.id,
        isDuplicate: false,
        fingerprint: created.opportunity_fingerprint ?? undefined,
        confidence: created.ai_confidence ?? analysis.confidence,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown analysis error';
      logger.error('opportunity_analysis_failed', {
        source_message_id: messageId,
        source_channel_id: message.source_channel_id,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      });

      // Mark message failed with error description
      try {
        await this.sourceMessagesRepo.markMessageFailed(messageId, errorMsg);
      } catch (dbErr: unknown) {
        logger.error('Failed to mark message failed in database', {
          messageId,
          error: dbErr instanceof Error ? dbErr.message : 'Unknown DB error',
        });
      }

      return {
        sourceMessageId: messageId,
        status: 'failed',
        error: errorMsg,
      };
    }
  }

  /**
   * Process a batch of pending source messages sequentially.
   */
  async processPendingMessages(limit = 5): Promise<ProcessMessageResult[]> {
    const pending = await this.sourceMessagesRepo.listPendingMessages(limit);
    const results: ProcessMessageResult[] = [];

    logger.info('Processing pending messages batch', { count: pending.length, limit });

    for (const msg of pending) {
      const result = await this.processSourceMessage(msg.id);
      results.push(result);
    }

    return results;
  }
}
