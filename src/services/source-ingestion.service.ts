/**
 * Source Ingestion Orchestration Service.
 *
 * Coordinates Phase 4 source polling and ingestion:
 *  1. Identifies enabled source channels and resolves their adapters.
 *  2. Evaluates checkpoints (timestamps and cursors).
 *  3. Fetches raw messages with bounded transient retries.
 *  4. Performs dual-layer duplicate detection (external message ID + SHA-256 content hash).
 *  5. Persists new messages with `processing_status = 'pending'` and `processed = false`.
 *  6. Updates source channel checkpoints.
 *  7. Enforces source error isolation across multiple channels.
 *
 * CRITICAL SCOPE BOUNDARY:
 *  - This service NEVER calls Gemini AI.
 *  - This service NEVER verifies opportunities.
 *  - This service NEVER publishes to channels.
 */

import { SourceChannelsRepository } from '../database/repositories/source-channels.repository.js';
import { SourceMessagesRepository } from '../database/repositories/source-messages.repository.js';
import { SourceRegistry } from '../sources/source.registry.js';
import { withSourceRetry } from '../sources/utils/retry.js';
import { generateContentHash } from '../utils/fingerprint.js';
import { logger } from '../config/logger.js';
import type { SourceChannelRow } from '../database/types.js';
import type { SourceFetchOptions, SourceIngestionResult } from '../domain/interfaces.js';

export interface IngestionOptions {
  limit?: number;
  forceAll?: boolean; // ignore last_checked_at checkpoint
  maxRetries?: number;
}

export class SourceIngestionService {
  private readonly sourceChannelsRepo: SourceChannelsRepository;
  private readonly sourceMessagesRepo: SourceMessagesRepository;
  private readonly sourceRegistry: SourceRegistry;

  constructor(
    sourceChannelsRepo?: SourceChannelsRepository,
    sourceMessagesRepo?: SourceMessagesRepository,
    sourceRegistry?: SourceRegistry,
  ) {
    this.sourceChannelsRepo = sourceChannelsRepo ?? new SourceChannelsRepository();
    this.sourceMessagesRepo = sourceMessagesRepo ?? new SourceMessagesRepository();
    this.sourceRegistry = sourceRegistry ?? new SourceRegistry();
  }

  /** Access the underlying source registry. */
  getRegistry(): SourceRegistry {
    return this.sourceRegistry;
  }

  /**
   * Ingest a single source channel.
   * Completely isolated: catches errors and returns structured result without throwing.
   */
  async ingestChannel(
    channel: SourceChannelRow,
    options: IngestionOptions = {},
  ): Promise<SourceIngestionResult> {
    const startTime = Date.now();

    // 1. Check if channel is enabled
    if (!channel.enabled) {
      logger.info('Source channel is disabled, skipping ingestion', {
        source_channel_id: channel.id,
        name: channel.name,
        platform: channel.platform,
      });

      return {
        sourceChannelId: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        status: 'skipped',
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        failed: 0,
        durationMs: Date.now() - startTime,
        error: 'Channel is disabled',
      };
    }

    // 2. Resolve adapter from registry
    const adapter = this.sourceRegistry.getAdapter(channel.platform, channel.external_channel_id);

    if (!adapter) {
      const errorMsg = `No source adapter registered for platform '${channel.platform}' (channel '${channel.name}')`;
      logger.warn('Source adapter not found in registry', {
        source_channel_id: channel.id,
        platform: channel.platform,
        name: channel.name,
      });

      return {
        sourceChannelId: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        status: 'failed',
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        failed: 0,
        durationMs: Date.now() - startTime,
        error: errorMsg,
      };
    }

    logger.info('source_ingestion_started', {
      source_channel_id: channel.id,
      sourceName: channel.name,
      platform: channel.platform,
      adapterIdentifier: adapter.identifier,
    });

    try {
      // 3. Prepare fetch options with checkpointing
      const fetchOptions: SourceFetchOptions = {
        limit: options.limit,
      };

      if (!options.forceAll && channel.last_checked_at) {
        fetchOptions.since = new Date(channel.last_checked_at);
      }

      // 4. Fetch raw messages with bounded retries
      const fetchResult = await withSourceRetry(() => adapter.fetchNewMessages(fetchOptions), {
        maxRetries: options.maxRetries ?? 2,
        operationName: `fetch_${channel.platform}_${channel.name}`,
      });

      const rawMessages = fetchResult.messages ?? [];
      let inserted = 0;
      let duplicates = 0;
      let failed = 0;

      // Track hashes seen in current batch to prevent intra-batch duplicates
      const batchSeenHashes = new Set<string>();
      const batchSeenExternalIds = new Set<string>();

      // 5. Process & deduplicate each message
      for (const rawMsg of rawMessages) {
        try {
          const rawText = rawMsg.rawText?.trim() ?? '';
          const contentHash = generateContentHash(rawText);

          // Check A: Intra-batch duplicate check
          if (rawMsg.externalMessageId && batchSeenExternalIds.has(rawMsg.externalMessageId)) {
            duplicates++;
            logger.info('source_message_duplicate', {
              source_channel_id: channel.id,
              reason: 'intra_batch_external_id_duplicate',
              external_message_id: rawMsg.externalMessageId,
            });
            continue;
          }

          if (batchSeenHashes.has(contentHash)) {
            duplicates++;
            logger.info('source_message_duplicate', {
              source_channel_id: channel.id,
              reason: 'intra_batch_content_hash_duplicate',
              content_hash: contentHash,
            });
            continue;
          }

          // Check B: Database duplicate check by External Message ID
          if (rawMsg.externalMessageId) {
            const existingByExternalId = await this.sourceMessagesRepo.getMessageByExternalId(
              channel.id,
              rawMsg.externalMessageId,
            );

            if (existingByExternalId) {
              duplicates++;
              batchSeenExternalIds.add(rawMsg.externalMessageId);
              logger.info('source_message_duplicate', {
                source_channel_id: channel.id,
                existing_message_id: existingByExternalId.id,
                external_message_id: rawMsg.externalMessageId,
                reason: 'existing_external_message_id',
              });
              continue;
            }
          }

          // Check C: Database duplicate check by SHA-256 Content Hash
          const existingByHash = await this.sourceMessagesRepo.getMessageByHash(contentHash);
          if (existingByHash) {
            duplicates++;
            batchSeenHashes.add(contentHash);
            logger.info('source_message_duplicate', {
              source_channel_id: channel.id,
              existing_message_id: existingByHash.id,
              content_hash: contentHash,
              reason: 'existing_content_hash',
            });
            continue;
          }

          // 6. Insert new source message with pending status
          const messageTimestamp = rawMsg.messageTimestamp
            ? rawMsg.messageTimestamp.toISOString()
            : null;

          const created = await this.sourceMessagesRepo.createSourceMessage({
            source_channel_id: channel.id,
            external_message_id: rawMsg.externalMessageId || null,
            raw_text: rawMsg.rawText ?? null,
            source_url: rawMsg.sourceUrl ?? null,
            media_url: rawMsg.mediaUrl ?? null,
            message_timestamp: messageTimestamp,
            content_hash: contentHash,
            processed: false,
            processing_status: 'pending',
          });

          inserted++;
          if (rawMsg.externalMessageId) batchSeenExternalIds.add(rawMsg.externalMessageId);
          batchSeenHashes.add(contentHash);

          logger.info('source_message_inserted', {
            source_message_id: created.id,
            source_channel_id: channel.id,
            external_message_id: rawMsg.externalMessageId,
            content_hash: contentHash,
          });
        } catch (msgErr: unknown) {
          const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);

          // Handle database uniqueness race conditions gracefully
          if (errMsg.includes('duplicate key') || errMsg.includes('23505')) {
            duplicates++;
            logger.info('source_message_duplicate', {
              source_channel_id: channel.id,
              reason: 'database_constraint_conflict',
            });
          } else {
            failed++;
            logger.error('Failed to insert source message', {
              source_channel_id: channel.id,
              error: errMsg,
            });
          }
        }
      }

      // 7. Update source channel last_checked_at checkpoint
      try {
        await this.sourceChannelsRepo.updateLastCheckedAt(channel.id);
      } catch (checkpointErr: unknown) {
        logger.error('Failed to update source channel checkpoint', {
          source_channel_id: channel.id,
          error: checkpointErr instanceof Error ? checkpointErr.message : String(checkpointErr),
        });
      }

      const durationMs = Date.now() - startTime;
      const status = failed > 0 ? (inserted > 0 ? 'partial' : 'failed') : 'success';

      logger.info('source_ingestion_completed', {
        source_channel_id: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        status,
        fetched: rawMessages.length,
        inserted,
        duplicates,
        failed,
        durationMs,
      });

      return {
        sourceChannelId: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        status,
        fetched: rawMessages.length,
        inserted,
        duplicates,
        failed,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error('source_ingestion_failed', {
        source_channel_id: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        error: errorMsg,
        durationMs,
      });

      return {
        sourceChannelId: channel.id,
        sourceName: channel.name,
        platform: channel.platform,
        status: 'failed',
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        failed: 0,
        durationMs,
        error: errorMsg,
      };
    }
  }

  /**
   * Ingest all enabled source channels with complete error isolation.
   * If one channel fails, remaining channels continue processing uninterrupted.
   */
  async ingestAllEnabledSources(options: IngestionOptions = {}): Promise<SourceIngestionResult[]> {
    logger.info('Starting ingestion run for all enabled source channels');
    const channels = await this.sourceChannelsRepo.listEnabledSourceChannels();
    const results: SourceIngestionResult[] = [];

    for (const channel of channels) {
      // Isolate each channel execution
      const result = await this.ingestChannel(channel, options);
      results.push(result);
    }

    const totalFetched = results.reduce((acc, r) => acc + r.fetched, 0);
    const totalInserted = results.reduce((acc, r) => acc + r.inserted, 0);
    const totalDuplicates = results.reduce((acc, r) => acc + r.duplicates, 0);
    const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);

    logger.info('All enabled source channels ingestion finished', {
      totalChannels: channels.length,
      totalFetched,
      totalInserted,
      totalDuplicates,
      totalFailed,
    });

    return results;
  }
}
