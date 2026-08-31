/**
 * CLI Development Helper for Source Ingestion.
 *
 * Runs the Phase 4 source ingestion engine with the FixtureSourceAdapter.
 * Works both with a connected Supabase database and in standalone in-memory mode.
 *
 * Usage:
 *   npm run ingest:test
 *   npx tsx src/cli/ingest-fixture.ts
 */

import { SourceIngestionService } from '../services/source-ingestion.service.js';
import { FixtureSourceAdapter } from '../sources/adapters/fixture-source.adapter.js';
import { SourceRegistry } from '../sources/source.registry.js';
import { SourceChannelsRepository } from '../database/repositories/source-channels.repository.js';
import { SourceMessagesRepository } from '../database/repositories/source-messages.repository.js';
import type { SourceChannelRow, SourceMessageRow, SourceMessageInsert } from '../database/types.js';

class InMemorySourceChannelsRepository extends SourceChannelsRepository {
  private readonly channels: Map<string, SourceChannelRow> = new Map();

  constructor(initialChannels: SourceChannelRow[] = []) {
    super();
    for (const ch of initialChannels) {
      this.channels.set(ch.id, ch);
    }
  }

  async listEnabledSourceChannels(): Promise<SourceChannelRow[]> {
    return Array.from(this.channels.values()).filter((c) => c.enabled);
  }

  async getSourceChannelById(id: string): Promise<SourceChannelRow | null> {
    return this.channels.get(id) ?? null;
  }

  async updateLastCheckedAt(id: string): Promise<void> {
    const channel = this.channels.get(id);
    if (channel) {
      channel.last_checked_at = new Date().toISOString();
      channel.updated_at = new Date().toISOString();
    }
  }
}

class InMemorySourceMessagesRepository extends SourceMessagesRepository {
  private readonly messages: Map<string, SourceMessageRow> = new Map();

  async createSourceMessage(data: SourceMessageInsert): Promise<SourceMessageRow> {
    const id = data.id ?? `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const row: SourceMessageRow = {
      id,
      source_channel_id: data.source_channel_id,
      external_message_id: data.external_message_id ?? null,
      raw_text: data.raw_text ?? null,
      source_url: data.source_url ?? null,
      media_url: data.media_url ?? null,
      message_timestamp: data.message_timestamp ?? null,
      content_hash: data.content_hash,
      processed: data.processed ?? false,
      processing_status: data.processing_status ?? 'pending',
      processing_error: data.processing_error ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.messages.set(id, row);
    return row;
  }

  async getMessageByExternalId(
    sourceChannelId: string,
    externalMessageId: string,
  ): Promise<SourceMessageRow | null> {
    for (const msg of this.messages.values()) {
      if (
        msg.source_channel_id === sourceChannelId &&
        msg.external_message_id === externalMessageId
      ) {
        return msg;
      }
    }
    return null;
  }

  async getMessageByHash(contentHash: string): Promise<SourceMessageRow | null> {
    for (const msg of this.messages.values()) {
      if (msg.content_hash === contentHash) {
        return msg;
      }
    }
    return null;
  }

  async getMessageById(id: string): Promise<SourceMessageRow | null> {
    return this.messages.get(id) ?? null;
  }
}

async function run(): Promise<void> {
  console.log('====================================================');
  console.log('⚡ HackNotify Autopilot — Source Ingestion Engine');
  console.log('====================================================\n');

  // Check if live DB environment variables are available
  const hasDbEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  const fixtureChannel: SourceChannelRow = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'HackNotify Fixture Source Channel',
    platform: 'manual',
    external_channel_id: 'fixture_source',
    channel_url: 'https://hacknotify.in/fixtures',
    description: 'Deterministic test channel for development and ingestion verification',
    enabled: true,
    last_checked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const registry = new SourceRegistry();
  const fixtureAdapter = new FixtureSourceAdapter({
    platform: 'manual',
    identifier: 'fixture_source',
  });
  registry.register(fixtureAdapter);

  let channelsRepo: SourceChannelsRepository;
  let messagesRepo: SourceMessagesRepository;

  if (hasDbEnv && process.env.USE_LIVE_DB === 'true') {
    console.log('🌐 Connected Mode: Using Supabase Database');
    channelsRepo = new SourceChannelsRepository();
    messagesRepo = new SourceMessagesRepository();
  } else {
    console.log('🧪 Standalone Mode: Using In-Memory Repository');
    channelsRepo = new InMemorySourceChannelsRepository([fixtureChannel]);
    messagesRepo = new InMemorySourceMessagesRepository();
  }

  const ingestionService = new SourceIngestionService(channelsRepo, messagesRepo, registry);

  console.log(
    `\n⏳ Ingesting channel: "${fixtureChannel.name}" [platform: ${fixtureChannel.platform}]...\n`,
  );

  const result = await ingestionService.ingestChannel(fixtureChannel, { forceAll: true });

  console.log('====================================================');
  console.log('📊 INGESTION SUMMARY');
  console.log('====================================================');
  console.log(`Source Channel:    ${result.sourceName}`);
  console.log(`Platform:          ${result.platform}`);
  console.log(
    `Status:            ${result.status === 'success' ? '✅ SUCCESS' : result.status.toUpperCase()}`,
  );
  console.log(`Messages Fetched:  ${result.fetched}`);
  console.log(`Messages Inserted: ${result.inserted}`);
  console.log(`Duplicates Found:  ${result.duplicates}`);
  console.log(`Failures:          ${result.failed}`);
  console.log(`Duration:          ${result.durationMs}ms`);
  if (result.error) {
    console.log(`Error:             ${result.error}`);
  }
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('❌ Ingestion CLI execution failed:', err);
  process.exit(1);
});
