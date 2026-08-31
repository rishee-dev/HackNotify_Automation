/**
 * Source Channels repository.
 *
 * All database operations for the source_channels table are
 * encapsulated here. No raw Supabase queries should exist
 * outside repository files.
 */

import { getSupabaseClient } from '../client.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../config/logger.js';
import type { SourceChannelRow, SourceChannelInsert } from '../types.js';

export class SourceChannelsRepository {
  private get db(): SupabaseClient {
    return getSupabaseClient();
  }

  /** Create a new source channel. */
  async createSourceChannel(data: SourceChannelInsert): Promise<SourceChannelRow> {
    const { data: channel, error } = await this.db
      .from('source_channels')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create source channel', {
        error: error.message,
        code: error.code,
      });
      throw new Error(`Failed to create source channel: ${error.message}`);
    }

    return channel as SourceChannelRow;
  }

  /** Get a source channel by its UUID. */
  async getSourceChannelById(id: string): Promise<SourceChannelRow | null> {
    const { data: channel, error } = await this.db
      .from('source_channels')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned — not found
        return null;
      }
      logger.error('Failed to get source channel', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to get source channel: ${error.message}`);
    }

    return channel as SourceChannelRow;
  }

  /** List all enabled source channels. */
  async listEnabledSourceChannels(): Promise<SourceChannelRow[]> {
    const { data: channels, error } = await this.db
      .from('source_channels')
      .select()
      .eq('enabled', true)
      .order('name');

    if (error) {
      logger.error('Failed to list enabled source channels', {
        error: error.message,
      });
      throw new Error(`Failed to list enabled source channels: ${error.message}`);
    }

    return (channels ?? []) as SourceChannelRow[];
  }

  /** Update the last_checked_at timestamp for a channel. */
  async updateLastCheckedAt(id: string): Promise<void> {
    const { error } = await this.db
      .from('source_channels')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      logger.error('Failed to update last_checked_at', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to update last_checked_at: ${error.message}`);
    }
  }
}
