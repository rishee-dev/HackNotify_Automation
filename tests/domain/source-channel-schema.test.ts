/**
 * Tests for source channel Zod validation schema.
 */

import { describe, it, expect } from 'vitest';
import { CreateSourceChannelSchema } from '../../src/domain/schemas.js';

describe('CreateSourceChannelSchema', () => {
  const validChannel = {
    name: 'Test Channel',
    platform: 'telegram' as const,
    channel_url: 'https://example.com/channel',
    description: 'A test source channel',
  };

  it('should accept a valid source channel', () => {
    const result = CreateSourceChannelSchema.safeParse(validChannel);
    expect(result.success).toBe(true);
  });

  it('should accept minimal required fields', () => {
    const result = CreateSourceChannelSchema.safeParse({
      name: 'Minimal',
      platform: 'manual',
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = CreateSourceChannelSchema.safeParse({
      platform: 'telegram',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const result = CreateSourceChannelSchema.safeParse({
      name: '',
      platform: 'telegram',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing platform', () => {
    const result = CreateSourceChannelSchema.safeParse({
      name: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid platform', () => {
    const result = CreateSourceChannelSchema.safeParse({
      name: 'Test',
      platform: 'invalid_platform',
    });

    expect(result.success).toBe(false);
  });

  it('should accept all valid platforms', () => {
    const platforms = [
      'whatsapp',
      'telegram',
      'website',
      'rss',
      'manual',
      'campus_leader',
      'other',
    ];

    for (const platform of platforms) {
      const result = CreateSourceChannelSchema.safeParse({
        name: 'Test',
        platform,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should default enabled to true', () => {
    const result = CreateSourceChannelSchema.safeParse({
      name: 'Test',
      platform: 'manual',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
    }
  });

  it('should reject invalid channel_url', () => {
    const result = CreateSourceChannelSchema.safeParse({
      ...validChannel,
      channel_url: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });
});
