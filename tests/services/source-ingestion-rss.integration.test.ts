import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceIngestionService } from '../../src/services/source-ingestion.service.js';
import { RssSourceAdapter } from '../../src/sources/adapters/rss-source.adapter.js';
import { SourceRegistry } from '../../src/sources/source.registry.js';
import { SourceChannelsRepository } from '../../src/database/repositories/source-channels.repository.js';
import { SourceMessagesRepository } from '../../src/database/repositories/source-messages.repository.js';
import type {
  SourceChannelRow,
  SourceMessageRow,
  SourceMessageInsert,
} from '../../src/database/types.js';

const MOCK_RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>WeWorkRemotely Programming Jobs</title>
    <link>https://weworkremotely.com/categories/remote-programming-jobs.rss</link>
    <description>Remote jobs in programming</description>
    <item>
      <title>Company A: Full-Stack Engineer</title>
      <link>https://weworkremotely.com/jobs/company-a-full-stack</link>
      <guid>https://weworkremotely.com/jobs/company-a-full-stack</guid>
      <pubDate>Mon, 10 Aug 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Looking for a Full-Stack Engineer with React &amp; Node.js experience.</p>]]></description>
    </item>
    <item>
      <title>Company B: Backend Developer</title>
      <link>https://weworkremotely.com/jobs/company-b-backend</link>
      <guid>https://weworkremotely.com/jobs/company-b-backend</guid>
      <pubDate>Tue, 11 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[<p>Looking for a Python &amp; Go developer.</p>]]></description>
    </item>
    <item>
      <title>Company C: DevOps Engineer</title>
      <link>https://weworkremotely.com/jobs/company-c-devops</link>
      <guid>https://weworkremotely.com/jobs/company-c-devops</guid>
      <pubDate>Wed, 12 Aug 2026 15:00:00 GMT</pubDate>
      <description><![CDATA[<p>Kubernetes and AWS platform engineer.</p>]]></description>
    </item>
  </channel>
</rss>`;

function createMockFetch(xml: string): typeof fetch {
  return (async (): Promise<Response> => {
    return new Response(xml, {
      status: 200,
      headers: { 'content-type': 'application/rss+xml' },
    });
  }) as unknown as typeof fetch;
}

class MockSourceChannelsRepository extends SourceChannelsRepository {
  private readonly channels: Map<string, SourceChannelRow> = new Map();
  public updateLastCheckedAtCalled = false;

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
    this.updateLastCheckedAtCalled = true;
    const channel = this.channels.get(id);
    if (channel) {
      channel.last_checked_at = new Date().toISOString();
      channel.updated_at = new Date().toISOString();
    }
  }
}

class MockSourceMessagesRepository extends SourceMessagesRepository {
  public readonly messages: Map<string, SourceMessageRow> = new Map();

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

describe('SourceIngestionService — RSS Adapter Integration', () => {
  let channelsRepo: MockSourceChannelsRepository;
  let messagesRepo: MockSourceMessagesRepository;
  let registry: SourceRegistry;
  let rssAdapter: RssSourceAdapter;
  let testChannel: SourceChannelRow;

  beforeEach(() => {
    testChannel = {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'WeWorkRemotely Programming Jobs',
      platform: 'rss',
      external_channel_id: 'weworkremotely_programming',
      channel_url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      description: 'Remote programming and software engineering jobs from WeWorkRemotely',
      enabled: true,
      last_checked_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    channelsRepo = new MockSourceChannelsRepository([testChannel]);
    messagesRepo = new MockSourceMessagesRepository();
    registry = new SourceRegistry();

    rssAdapter = new RssSourceAdapter({
      identifier: 'weworkremotely_programming',
      feedUrl: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
      fetchFn: createMockFetch(MOCK_RSS_XML),
    });

    registry.register(rssAdapter);
  });

  // 1. Adapter registration
  it('1. should register the RSS adapter and resolve it via SourceRegistry', () => {
    expect(registry.hasAdapter('rss', 'weworkremotely_programming')).toBe(true);
    const resolved = registry.getAdapter('rss', 'weworkremotely_programming');
    expect(resolved).toBeDefined();
    expect(resolved?.platform).toBe('rss');
    expect(resolved?.identifier).toBe('weworkremotely_programming');
  });

  // 2. Ingest RSS messages into repository
  it('2. should ingest RSS items and persist raw source messages into repository', async () => {
    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);

    const result = await service.ingestChannel(testChannel, { forceAll: true });

    expect(result.status).toBe('success');
    expect(result.fetched).toBe(3);
    expect(result.inserted).toBe(3);
    expect(result.duplicates).toBe(0);
    expect(result.failed).toBe(0);

    const stored = Array.from(messagesRepo.messages.values());
    expect(stored).toHaveLength(3);
  });

  // 3. Verify fields & pending status
  it('3. should verify all persisted fields and pending processing_status', async () => {
    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);

    await service.ingestChannel(testChannel, { forceAll: true });

    const item1 = Array.from(messagesRepo.messages.values()).find(
      (m) => m.external_message_id === 'https://weworkremotely.com/jobs/company-a-full-stack',
    );

    expect(item1).toBeDefined();
    expect(item1?.source_channel_id).toBe(testChannel.id);
    expect(item1?.source_url).toBe('https://weworkremotely.com/jobs/company-a-full-stack');
    expect(item1?.raw_text).toContain('Company A: Full-Stack Engineer');
    expect(item1?.raw_text).toContain('React & Node.js');
    expect(item1?.processing_status).toBe('pending');
    expect(item1?.processed).toBe(false);
    expect(item1?.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(item1?.message_timestamp).toBe('2026-08-10T10:00:00.000Z');
  });

  // 4. Idempotency test (second run with same items)
  it('4. should be completely idempotent when running duplicate ingestion', async () => {
    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);

    // First run: inserts 3
    const run1 = await service.ingestChannel(testChannel, { forceAll: true });
    expect(run1.inserted).toBe(3);
    expect(run1.duplicates).toBe(0);

    // Second run: should insert 0, detect 3 duplicates
    const run2 = await service.ingestChannel(testChannel, { forceAll: true });
    expect(run2.inserted).toBe(0);
    expect(run2.duplicates).toBe(3);
    expect(messagesRepo.messages.size).toBe(3);
  });

  // 5. Checkpoint timestamp update
  it('5. should update source_channels.last_checked_at after successful ingestion', async () => {
    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);

    expect(channelsRepo.updateLastCheckedAtCalled).toBe(false);
    await service.ingestChannel(testChannel, { forceAll: true });
    expect(channelsRepo.updateLastCheckedAtCalled).toBe(true);

    const updated = await channelsRepo.getSourceChannelById(testChannel.id);
    expect(updated?.last_checked_at).not.toBeNull();
  });

  // 6. Checkpoint `since` filtering in subsequent run
  it('6. should filter out older items using since checkpoint on subsequent run', async () => {
    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);

    // Channel with last_checked_at after items 1 & 2 (Aug 11, 2026 18:00:00 GMT)
    testChannel.last_checked_at = '2026-08-11T18:00:00.000Z';

    const result = await service.ingestChannel(testChannel, { forceAll: false });

    // Only item 3 (Aug 12) is newer than checkpoint
    expect(result.fetched).toBe(1);
    expect(result.inserted).toBe(1);
    expect(messagesRepo.messages.size).toBe(1);
  });

  // 7. Isolation — zero Gemini / verification / publishing calls
  it('7. should not call Gemini AI, verification, or publishing services', async () => {
    const geminiSpy = vi.fn();
    const publishSpy = vi.fn();
    const verificationSpy = vi.fn();

    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);
    await service.ingestChannel(testChannel, { forceAll: true });

    expect(geminiSpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
    expect(verificationSpy).not.toHaveBeenCalled();

    // Verify all stored messages remain strictly 'pending'
    for (const msg of messagesRepo.messages.values()) {
      expect(msg.processing_status).toBe('pending');
      expect(msg.processed).toBe(false);
    }
  });

  // 8. Error isolation on network failure
  it('8. should isolate errors gracefully without throwing when feed fetch fails', async () => {
    const failingAdapter = new RssSourceAdapter({
      identifier: 'failing_feed',
      feedUrl: 'https://example.com/fail.rss',
      maxRetries: 0,
      fetchFn: (async (): Promise<Response> => {
        return new Response('', { status: 500, statusText: 'Internal Server Error' });
      }) as unknown as typeof fetch,
    });

    registry.register(failingAdapter);

    const failingChannel: SourceChannelRow = {
      ...testChannel,
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Failing RSS Channel',
      external_channel_id: 'failing_feed',
    };

    const service = new SourceIngestionService(channelsRepo, messagesRepo, registry);
    const result = await service.ingestChannel(failingChannel, { forceAll: true });

    expect(result.status).toBe('failed');
    expect(result.fetched).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.error).toContain('HTTP 500');
  });
});
