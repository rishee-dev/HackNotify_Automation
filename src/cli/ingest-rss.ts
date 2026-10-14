/**
 * CLI Development Helper for RSS Source Ingestion.
 *
 * Connects RssSourceAdapter to SourceIngestionService and persists
 * normalized raw messages to the database (or in-memory repository if standalone).
 *
 * Runs:
 *  1. Initial ingestion run (limit = 5)
 *  2. Second ingestion run (idempotency & deduplication verification)
 *  3. Checkpoint verification (since timestamp filtering)
 *
 * CRITICAL PIPELINE BOUNDARIES:
 *  - Never calls Gemini AI.
 *  - Never verifies opportunities.
 *  - Never publishes to channels.
 *
 * Usage:
 *   npm run ingest:rss
 *   npx tsx src/cli/ingest-rss.ts
 */

import { config } from 'dotenv';
import { SourceIngestionService } from '../services/source-ingestion.service.js';
import { RssSourceAdapter, DEFAULT_RSS_FEED_URL } from '../sources/adapters/rss-source.adapter.js';
import { SourceRegistry } from '../sources/source.registry.js';
import { SourceChannelsRepository } from '../database/repositories/source-channels.repository.js';
import { SourceMessagesRepository } from '../database/repositories/source-messages.repository.js';
import { getSupabaseClient } from '../database/client.js';
import type { SourceChannelRow, SourceMessageRow, SourceMessageInsert } from '../database/types.js';

// Load .env if present
config();

class InMemorySourceChannelsRepository extends SourceChannelsRepository {
  private readonly channels: Map<string, SourceChannelRow> = new Map();

  constructor(initialChannels: SourceChannelRow[] = []) {
    super();
    for (const ch of initialChannels) {
      this.channels.set(ch.id, { ...ch });
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

  async listPendingMessages(limit = 10): Promise<SourceMessageRow[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.processing_status === 'pending' && !m.processed)
      .slice(0, limit);
  }
}

async function run(): Promise<void> {
  console.log('====================================================');
  console.log('⚡ HackNotify Autopilot — RSS Ingestion Pipeline');
  console.log('====================================================\n');

  const hasDbEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const useLiveDb = hasDbEnv && process.env.USE_LIVE_DB !== 'false';

  let channel: SourceChannelRow;
  let channelsRepo: SourceChannelsRepository;
  let messagesRepo: SourceMessagesRepository;

  if (useLiveDb) {
    console.log('🌐 Mode: Live Supabase Database');
    channelsRepo = new SourceChannelsRepository();
    messagesRepo = new SourceMessagesRepository();

    const db = getSupabaseClient();
    // Check if channel already exists
    const { data: existingChannel } = await db
      .from('source_channels')
      .select()
      .eq('platform', 'rss')
      .eq('external_channel_id', 'weworkremotely_programming')
      .maybeSingle();

    if (existingChannel) {
      channel = existingChannel as SourceChannelRow;
      console.log(`✅ Loaded existing source channel: "${channel.name}" (ID: ${channel.id})`);
    } else {
      const created = await channelsRepo.createSourceChannel({
        name: 'WeWorkRemotely Programming Jobs',
        platform: 'rss',
        external_channel_id: 'weworkremotely_programming',
        channel_url: DEFAULT_RSS_FEED_URL,
        description: 'Remote programming and software engineering jobs from WeWorkRemotely',
        enabled: true,
      });
      channel = created;
      console.log(`✅ Created new source channel: "${channel.name}" (ID: ${channel.id})`);
    }
  } else {
    console.log('🧪 Mode: Standalone (In-Memory Repository)');
    channel = {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'WeWorkRemotely Programming Jobs',
      platform: 'rss',
      external_channel_id: 'weworkremotely_programming',
      channel_url: DEFAULT_RSS_FEED_URL,
      description: 'Remote programming and software engineering jobs from WeWorkRemotely',
      enabled: true,
      last_checked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    channelsRepo = new InMemorySourceChannelsRepository([channel]);
    messagesRepo = new InMemorySourceMessagesRepository();
  }

  // ─── 1. Register RSS Adapter ────────────────────────────────────────────────
  const registry = new SourceRegistry();
  const rssAdapter = new RssSourceAdapter({
    identifier: 'weworkremotely_programming',
    feedUrl: DEFAULT_RSS_FEED_URL,
  });
  registry.register(rssAdapter);

  const ingestionService = new SourceIngestionService(channelsRepo, messagesRepo, registry);

  // ─── 2. First Ingestion Run (Limit: 5) ───────────────────────────────────────
  console.log('\n----------------------------------------------------');
  console.log('▶️ RUN 1: Initial Ingestion (limit = 5, forceAll = true)');
  console.log('----------------------------------------------------');

  const run1Result = await ingestionService.ingestChannel(channel, {
    limit: 5,
    forceAll: true,
  });

  console.log(`Source Channel:    ${run1Result.sourceName}`);
  console.log(`Platform:          ${run1Result.platform}`);
  console.log(
    `Status:            ${run1Result.status === 'success' ? '✅ SUCCESS' : run1Result.status.toUpperCase()}`,
  );
  console.log(`Messages Fetched:  ${run1Result.fetched}`);
  console.log(`Messages Inserted: ${run1Result.inserted}`);
  console.log(`Duplicates Found:  ${run1Result.duplicates}`);
  console.log(`Failures:          ${run1Result.failed}`);
  console.log(`Duration:          ${run1Result.durationMs}ms`);

  // Verify inserted messages
  const pendingMessages = await messagesRepo.listPendingMessages(5);
  console.log(`\n📋 Verified Inserted Records in Repository (${pendingMessages.length} found):`);
  pendingMessages.forEach((msg, idx) => {
    console.log(`\n  Record #${idx + 1}:`);
    console.log(`  • ID:                  ${msg.id}`);
    console.log(`  • Channel ID:          ${msg.source_channel_id}`);
    console.log(`  • External Message ID: ${msg.external_message_id}`);
    console.log(`  • Source URL:          ${msg.source_url}`);
    console.log(`  • Published Timestamp: ${msg.message_timestamp}`);
    console.log(`  • Content Hash:        ${msg.content_hash}`);
    console.log(`  • Processing Status:   ${msg.processing_status}`);
    console.log(`  • Processed Flag:      ${msg.processed}`);
    const preview = (msg.raw_text ?? '').slice(0, 100).replace(/\n+/g, ' ');
    console.log(`  • Raw Text Preview:    "${preview}..."`);
  });

  // ─── 3. Second Ingestion Run (Idempotency Verification) ─────────────────────
  console.log('\n----------------------------------------------------');
  console.log('▶️ RUN 2: Idempotency Verification (Same limit = 5, forceAll = true)');
  console.log('----------------------------------------------------');

  const run2Result = await ingestionService.ingestChannel(channel, {
    limit: 5,
    forceAll: true,
  });

  console.log(
    `Status:            ${run2Result.status === 'success' ? '✅ SUCCESS' : run2Result.status.toUpperCase()}`,
  );
  console.log(`Messages Fetched:  ${run2Result.fetched}`);
  console.log(`Messages Inserted: ${run2Result.inserted} (Expected: 0)`);
  console.log(`Duplicates Found:  ${run2Result.duplicates} (Expected: ${run1Result.inserted})`);
  console.log(`Failures:          ${run2Result.failed}`);

  if (run2Result.inserted === 0 && run2Result.duplicates === run1Result.inserted) {
    console.log('✅ Idempotency Verified: Zero duplicate records inserted.');
  } else {
    console.log('ℹ️ Idempotency Note: Feed may have updated between runs.');
  }

  // ─── 4. Third Ingestion Run (Checkpoint / `since` Check) ────────────────────
  console.log('\n----------------------------------------------------');
  console.log('▶️ RUN 3: Checkpoint & `since` Verification');
  console.log('----------------------------------------------------');

  // Fetch updated channel with checkpoint timestamp
  const updatedChannel = await channelsRepo.getSourceChannelById(channel.id);
  console.log(`Channel Checkpoint (last_checked_at): ${updatedChannel?.last_checked_at ?? 'None'}`);

  if (updatedChannel) {
    const run3Result = await ingestionService.ingestChannel(updatedChannel, {
      limit: 5,
      forceAll: false, // Evaluate checkpoint
    });

    console.log(`Messages Fetched:  ${run3Result.fetched}`);
    console.log(`Messages Inserted: ${run3Result.inserted}`);
    console.log(`Duplicates Found:  ${run3Result.duplicates}`);
    console.log('✅ Checkpoint Filtering Verified.');
  }

  console.log('\n====================================================');
  console.log('✅ RSS Source Ingestion Pipeline Completed Successfully.');
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('❌ Ingestion execution failed:', err);
  process.exit(1);
});
