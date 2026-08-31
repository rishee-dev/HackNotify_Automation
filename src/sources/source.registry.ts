/**
 * Source Registry for managing pluggable OpportunitySource adapters.
 *
 * Enables polymorphic source handling so the application never relies on hardcoded
 * platform conditionals (e.g. `if (platform === 'whatsapp')`).
 */

import type { SourcePlatform } from '../domain/enums.js';
import type { OpportunitySource } from '../domain/interfaces.js';
import { logger } from '../config/logger.js';

export class SourceRegistry {
  private readonly adapters = new Map<string, OpportunitySource>();

  /**
   * Compute a composite registration key for an adapter.
   */
  private makeKey(platform: SourcePlatform, identifier: string): string {
    return `${platform}:${identifier.toLowerCase()}`;
  }

  /**
   * Register a new source adapter.
   */
  register(adapter: OpportunitySource): void {
    const key = this.makeKey(adapter.platform, adapter.identifier);

    if (this.adapters.has(key)) {
      logger.warn('Overwriting existing source adapter registration', {
        platform: adapter.platform,
        identifier: adapter.identifier,
      });
    }

    this.adapters.set(key, adapter);
    logger.info('Source adapter registered', {
      platform: adapter.platform,
      identifier: adapter.identifier,
    });
  }

  /**
   * Get an adapter by platform and optional identifier.
   * If identifier is omitted, returns the first registered adapter for the platform.
   */
  getAdapter(platform: SourcePlatform, identifier?: string | null): OpportunitySource | undefined {
    if (identifier) {
      const key = this.makeKey(platform, identifier);
      const exact = this.adapters.get(key);
      if (exact) return exact;
    }

    // Fallback: search for any adapter matching the platform
    for (const adapter of this.adapters.values()) {
      if (adapter.platform === platform) {
        return adapter;
      }
    }

    return undefined;
  }

  /**
   * Check whether an adapter is registered.
   */
  hasAdapter(platform: SourcePlatform, identifier?: string | null): boolean {
    return this.getAdapter(platform, identifier) !== undefined;
  }

  /**
   * Get all currently registered adapters.
   */
  getAllAdapters(): OpportunitySource[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Unregister an adapter by platform and identifier.
   */
  unregister(platform: SourcePlatform, identifier: string): boolean {
    const key = this.makeKey(platform, identifier);
    return this.adapters.delete(key);
  }

  /**
   * Clear all registered adapters (useful for testing).
   */
  clear(): void {
    this.adapters.clear();
  }
}
