/**
 * Source Messages repository.
 *
 * Handles all database operations for raw ingested messages.
 * Includes lookup methods optimized for duplicate detection
 * (by external ID and content hash).
 */

import { getSupabaseClient } from '../client.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../config/logger.js';
import type { SourceMessageRow, SourceMessageInsert } from '../types.js';

export class SourceMessagesRepository {
  private get db(): SupabaseClient {
    return getSupabaseClient();
  }

  /** Insert a new source message. */
  async createSourceMessage(data: SourceMessageInsert): Promise<SourceMessageRow> {
    const { data: message, error } = await this.db
      .from('source_messages')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create source message', {
        error: error.message,
        code: error.code,
      });
      throw new Error(`Failed to create source message: ${error.message}`);
    }

    return message as SourceMessageRow;
  }

  /** Get a source message by its UUID. */
  async getMessageById(id: string): Promise<SourceMessageRow | null> {
    const { data: message, error } = await this.db
      .from('source_messages')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('Failed to get source message by ID', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to get source message by ID: ${error.message}`);
    }

    return message as SourceMessageRow;
  }

  /** List pending unprocessed source messages. */
  async listPendingMessages(limit = 10): Promise<SourceMessageRow[]> {
    const { data: messages, error } = await this.db
      .from('source_messages')
      .select()
      .eq('processing_status', 'pending')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error('Failed to list pending source messages', {
        error: error.message,
      });
      throw new Error(`Failed to list pending source messages: ${error.message}`);
    }

    return (messages ?? []) as SourceMessageRow[];
  }

  /**
   * Find a message by source channel + external message ID.
   * Used to answer: "Have we already ingested this specific message?"
   */
  async getMessageByExternalId(
    sourceChannelId: string,
    externalMessageId: string,
  ): Promise<SourceMessageRow | null> {
    const { data: message, error } = await this.db
      .from('source_messages')
      .select()
      .eq('source_channel_id', sourceChannelId)
      .eq('external_message_id', externalMessageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('Failed to get message by external ID', {
        error: error.message,
        sourceChannelId,
        externalMessageId,
      });
      throw new Error(`Failed to get message by external ID: ${error.message}`);
    }

    return message as SourceMessageRow;
  }

  /**
   * Find a message by its content hash.
   * Used for cross-source duplicate detection at the raw message level.
   */
  async getMessageByHash(contentHash: string): Promise<SourceMessageRow | null> {
    const { data: message, error } = await this.db
      .from('source_messages')
      .select()
      .eq('content_hash', contentHash)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('Failed to get message by hash', {
        error: error.message,
      });
      throw new Error(`Failed to get message by hash: ${error.message}`);
    }

    return message as SourceMessageRow;
  }

  /** Mark a message as currently being processed. */
  async markMessageProcessing(id: string): Promise<void> {
    const { error } = await this.db
      .from('source_messages')
      .update({ processing_status: 'processing' })
      .eq('id', id);

    if (error) {
      logger.error('Failed to mark message processing', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to mark message processing: ${error.message}`);
    }
  }

  /** Mark a message as successfully processed. */
  async markMessageProcessed(id: string): Promise<void> {
    const { error } = await this.db
      .from('source_messages')
      .update({
        processing_status: 'processed',
        processed: true,
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to mark message processed', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to mark message processed: ${error.message}`);
    }
  }

  /** Mark a message as failed with an error description. */
  async markMessageFailed(id: string, processingError: string): Promise<void> {
    const { error } = await this.db
      .from('source_messages')
      .update({
        processing_status: 'failed',
        processing_error: processingError,
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to mark message failed', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to mark message failed: ${error.message}`);
    }
  }
}
