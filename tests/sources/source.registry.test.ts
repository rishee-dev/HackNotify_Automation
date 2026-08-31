import { describe, it, expect, beforeEach } from 'vitest';
import { SourceRegistry } from '../../src/sources/source.registry.js';
import type { SourcePlatform } from '../../src/domain/enums.js';
import type { OpportunitySource, SourceFetchResult } from '../../src/domain/interfaces.js';

class MockAdapter implements OpportunitySource {
  constructor(
    public readonly platform: SourcePlatform,
    public readonly identifier: string,
  ) {}

  async fetchNewMessages(): Promise<SourceFetchResult> {
    return { messages: [] };
  }
}

describe('SourceRegistry', () => {
  let registry: SourceRegistry;

  beforeEach(() => {
    registry = new SourceRegistry();
  });

  it('should register and retrieve an adapter by platform and identifier', () => {
    const adapter = new MockAdapter('manual', 'fixture_source');
    registry.register(adapter);

    const retrieved = registry.getAdapter('manual', 'fixture_source');
    expect(retrieved).toBe(adapter);
    expect(registry.hasAdapter('manual', 'fixture_source')).toBe(true);
  });

  it('should retrieve adapter by platform alone if identifier is not specified', () => {
    const adapter = new MockAdapter('telegram', 'hacknotify_tg_bot');
    registry.register(adapter);

    const retrieved = registry.getAdapter('telegram');
    expect(retrieved).toBe(adapter);
    expect(registry.hasAdapter('telegram')).toBe(true);
  });

  it('should return undefined when adapter is not registered', () => {
    expect(registry.getAdapter('whatsapp', 'non_existent')).toBeUndefined();
    expect(registry.hasAdapter('whatsapp')).toBe(false);
  });

  it('should list all registered adapters', () => {
    const adapter1 = new MockAdapter('manual', 'fixture_1');
    const adapter2 = new MockAdapter('rss', 'tech_feed');
    registry.register(adapter1);
    registry.register(adapter2);

    const all = registry.getAllAdapters();
    expect(all).toHaveLength(2);
    expect(all).toContain(adapter1);
    expect(all).toContain(adapter2);
  });

  it('should unregister an adapter cleanly', () => {
    const adapter = new MockAdapter('manual', 'fixture_1');
    registry.register(adapter);

    expect(registry.hasAdapter('manual', 'fixture_1')).toBe(true);
    const removed = registry.unregister('manual', 'fixture_1');
    expect(removed).toBe(true);
    expect(registry.hasAdapter('manual', 'fixture_1')).toBe(false);
  });

  it('should clear all adapters', () => {
    registry.register(new MockAdapter('manual', 'fixture_1'));
    registry.register(new MockAdapter('rss', 'feed_1'));

    registry.clear();
    expect(registry.getAllAdapters()).toHaveLength(0);
  });
});
