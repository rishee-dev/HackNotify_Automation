/**
 * Tests for source message Zod validation schema.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateSourceMessageSchema,
  SourceFetchOptionsSchema,
  RawSourceMessageSchema,
} from '../../src/domain/schemas.js';

describe('CreateSourceMessageSchema', () => {
  const validMessage = {
    source_channel_id: '00000000-0000-0000-0000-000000000001',
    content_hash: 'abc123def456',
    raw_text: 'Test message content',
  };

  it('should accept a valid source message', () => {
    const result = CreateSourceMessageSchema.safeParse(validMessage);
    expect(result.success).toBe(true);
  });

  it('should accept minimal required fields', () => {
    const result = CreateSourceMessageSchema.safeParse({
      source_channel_id: '00000000-0000-0000-0000-000000000001',
      content_hash: 'hash123',
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing source_channel_id', () => {
    const result = CreateSourceMessageSchema.safeParse({
      content_hash: 'hash123',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid UUID for source_channel_id', () => {
    const result = CreateSourceMessageSchema.safeParse({
      source_channel_id: 'not-a-uuid',
      content_hash: 'hash123',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing content_hash', () => {
    const result = CreateSourceMessageSchema.safeParse({
      source_channel_id: '00000000-0000-0000-0000-000000000001',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty content_hash', () => {
    const result = CreateSourceMessageSchema.safeParse({
      source_channel_id: '00000000-0000-0000-0000-000000000001',
      content_hash: '',
    });

    expect(result.success).toBe(false);
  });

  it('should default processing_status to pending', () => {
    const result = CreateSourceMessageSchema.safeParse(validMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.processing_status).toBe('pending');
    }
  });

  it('should default processed to false', () => {
    const result = CreateSourceMessageSchema.safeParse(validMessage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.processed).toBe(false);
    }
  });

  it('should reject invalid processing_status', () => {
    const result = CreateSourceMessageSchema.safeParse({
      ...validMessage,
      processing_status: 'invalid_status',
    });

    expect(result.success).toBe(false);
  });

  it('should accept all valid processing statuses', () => {
    const statuses = ['pending', 'processing', 'processed', 'failed', 'ignored'];

    for (const status of statuses) {
      const result = CreateSourceMessageSchema.safeParse({
        ...validMessage,
        processing_status: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept null optional fields', () => {
    const result = CreateSourceMessageSchema.safeParse({
      ...validMessage,
      external_message_id: null,
      raw_text: null,
      source_url: null,
      media_url: null,
      message_timestamp: null,
      processing_error: null,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid source_url format', () => {
    const result = CreateSourceMessageSchema.safeParse({
      ...validMessage,
      source_url: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('should coerce message_timestamp string to Date', () => {
    const result = CreateSourceMessageSchema.safeParse({
      ...validMessage,
      message_timestamp: '2024-01-15T10:00:00Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message_timestamp).toBeInstanceOf(Date);
    }
  });
});

describe('SourceFetchOptionsSchema', () => {
  it('should accept empty options', () => {
    const result = SourceFetchOptionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept valid cursor, since, and limit', () => {
    const result = SourceFetchOptionsSchema.safeParse({
      cursor: 'msg-123',
      since: '2026-01-01T00:00:00.000Z',
      limit: 25,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.since).toBeInstanceOf(Date);
      expect(result.data.limit).toBe(25);
    }
  });

  it('should reject invalid limit (e.g. negative or non-integer)', () => {
    const result = SourceFetchOptionsSchema.safeParse({
      limit: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe('RawSourceMessageSchema', () => {
  it('should accept a valid raw source message with metadata', () => {
    const result = RawSourceMessageSchema.safeParse({
      externalMessageId: 'ext-001',
      rawText: 'Opportunity text here',
      sourceUrl: 'https://example.com/opp',
      mediaUrl: 'https://example.com/banner.png',
      messageTimestamp: '2026-01-01T10:00:00.000Z',
      metadata: { priority: 'high', channelName: 'DevGroup' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid URL formats in sourceUrl', () => {
    const result = RawSourceMessageSchema.safeParse({
      sourceUrl: 'invalid-url-string',
    });
    expect(result.success).toBe(false);
  });
});
