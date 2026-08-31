import { describe, it, expect } from 'vitest';
import {
  FixtureSourceAdapter,
  DEFAULT_FIXTURE_MESSAGES,
} from '../../src/sources/adapters/fixture-source.adapter.js';

describe('FixtureSourceAdapter', () => {
  it('should initialize with default options and deterministic messages', async () => {
    const adapter = new FixtureSourceAdapter();
    expect(adapter.platform).toBe('manual');
    expect(adapter.identifier).toBe('fixture_source');

    const result = await adapter.fetchNewMessages();
    expect(result.messages).toHaveLength(DEFAULT_FIXTURE_MESSAGES.length);
    expect(result.messages[0].externalMessageId).toBe('fix-msg-001');
    expect(result.messages[0].rawText).toContain('Amazon');
    expect(result.hasMore).toBe(false);
  });

  it('should support custom platform and identifier initialization', async () => {
    const adapter = new FixtureSourceAdapter({
      platform: 'website',
      identifier: 'custom_fixture',
    });

    expect(adapter.platform).toBe('website');
    expect(adapter.identifier).toBe('custom_fixture');
  });

  it('should filter messages by timestamp checkpoint (since)', async () => {
    const adapter = new FixtureSourceAdapter();

    // All messages before 2026-01-01T12:30:00.000Z should be filtered out
    const sinceDate = new Date('2026-01-01T12:30:00.000Z');
    const result = await adapter.fetchNewMessages({ since: sinceDate });

    for (const msg of result.messages) {
      if (msg.messageTimestamp) {
        expect(msg.messageTimestamp.getTime()).toBeGreaterThan(sinceDate.getTime());
      }
    }
    expect(result.messages.length).toBeLessThan(DEFAULT_FIXTURE_MESSAGES.length);
  });

  it('should paginate messages using limit and nextCursor', async () => {
    const adapter = new FixtureSourceAdapter();

    const page1 = await adapter.fetchNewMessages({ limit: 3 });
    expect(page1.messages).toHaveLength(3);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('fix-msg-003');

    // Fetch page 2 using cursor
    const page2 = await adapter.fetchNewMessages({
      cursor: page1.nextCursor,
      limit: 3,
    });
    expect(page2.messages).toHaveLength(3);
    expect(page2.messages[0].externalMessageId).toBe('fix-msg-004');
  });

  it('should return empty list if cursor is at the end', async () => {
    const adapter = new FixtureSourceAdapter();
    const lastId = DEFAULT_FIXTURE_MESSAGES[DEFAULT_FIXTURE_MESSAGES.length - 1].externalMessageId;

    const result = await adapter.fetchNewMessages({ cursor: lastId });
    expect(result.messages).toHaveLength(0);
    expect(result.hasMore).toBe(false);
  });

  it('should preserve URLs and media URLs exactly in fixture messages', async () => {
    const adapter = new FixtureSourceAdapter();
    const result = await adapter.fetchNewMessages();

    const ethIndia = result.messages.find((m) => m.externalMessageId === 'fix-msg-003');
    expect(ethIndia).toBeDefined();
    expect(ethIndia?.sourceUrl).toBe('https://ethindia.devfolio.co/');
    expect(ethIndia?.mediaUrl).toBe('https://ethindia.devfolio.co/banner.png');
  });

  it('should include prompt injection test fixture as inert text', async () => {
    const adapter = new FixtureSourceAdapter();
    const result = await adapter.fetchNewMessages();

    const injection = result.messages.find((m) => m.externalMessageId === 'fix-msg-008');
    expect(injection).toBeDefined();
    expect(injection?.rawText).toContain('Ignore all previous instructions');
  });
});
