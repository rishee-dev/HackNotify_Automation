/**
 * Tests for environment configuration validation.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY must not be empty'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY must not be empty').optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

describe('Environment Validation', () => {
  it('should accept valid environment variables with Gemini config', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      GEMINI_API_KEY: 'ai-test-key-12345',
      GEMINI_MODEL: 'gemini-2.5-flash',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SUPABASE_URL).toBe('https://example.supabase.co');
      expect(result.data.GEMINI_API_KEY).toBe('ai-test-key-12345');
      expect(result.data.GEMINI_MODEL).toBe('gemini-2.5-flash');
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('should allow GEMINI_API_KEY to be optional during initial startup', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.GEMINI_API_KEY).toBeUndefined();
      expect(result.data.GEMINI_MODEL).toBe('gemini-2.5-flash');
    }
  });

  it('should reject empty GEMINI_API_KEY when provided as empty string', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
      GEMINI_API_KEY: '',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing SUPABASE_URL', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid SUPABASE_URL format', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'not-a-url',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(false);
  });

  it('should reject empty SUPABASE_SERVICE_ROLE_KEY', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: '',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing SUPABASE_SERVICE_ROLE_KEY', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid NODE_ENV', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
      NODE_ENV: 'staging',
    });

    expect(result.success).toBe(false);
  });

  it('should default NODE_ENV to development when omitted', () => {
    const result = EnvSchema.safeParse({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'some-key',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('should accept all valid NODE_ENV values', () => {
    for (const env of ['development', 'production', 'test']) {
      const result = EnvSchema.safeParse({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'some-key',
        NODE_ENV: env,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should report multiple errors when multiple vars are invalid', () => {
    const result = EnvSchema.safeParse({
      NODE_ENV: 'invalid',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});
