/**
 * Tests for the opportunity fingerprint generation utility.
 */

import { describe, it, expect } from 'vitest';
import {
  generateOpportunityFingerprint,
  generateContentHash,
  normalizeText,
  normalizeUrl,
} from '../../src/utils/fingerprint.js';

describe('normalizeText', () => {
  it('should lowercase text', () => {
    expect(normalizeText('HELLO WORLD')).toBe('hello world');
  });

  it('should trim whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('should collapse internal whitespace', () => {
    expect(normalizeText('hello    world   test')).toBe('hello world test');
  });

  it('should return empty string for null', () => {
    expect(normalizeText(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(normalizeText(undefined)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('should handle mixed case and whitespace', () => {
    expect(normalizeText('  Example   Corp  ')).toBe('example corp');
  });
});

describe('normalizeUrl', () => {
  it('should lowercase URLs', () => {
    expect(normalizeUrl('HTTPS://EXAMPLE.COM/Apply')).toBe('https://example.com/apply');
  });

  it('should strip trailing slashes', () => {
    expect(normalizeUrl('https://example.com/apply/')).toBe('https://example.com/apply');
  });

  it('should return empty string for null', () => {
    expect(normalizeUrl(null)).toBe('');
  });

  it('should return empty string for undefined', () => {
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('should fallback to normalizeText for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  it('should preserve query parameters', () => {
    const url = 'https://example.com/apply?ref=hacknotify&utm=test';
    const result = normalizeUrl(url);
    expect(result).toContain('ref=hacknotify');
    expect(result).toContain('utm=test');
  });
});

describe('generateOpportunityFingerprint', () => {
  it('should generate a deterministic fingerprint', () => {
    const input = {
      company: 'Example Corp',
      title: 'Software Intern',
      location: 'Remote',
      apply_url: 'https://example.com/apply',
    };

    const fp1 = generateOpportunityFingerprint(input);
    const fp2 = generateOpportunityFingerprint(input);
    expect(fp1).toBe(fp2);
  });

  it('should return a 64-character hex string (SHA-256)', () => {
    const fp = generateOpportunityFingerprint({
      company: 'Test',
      title: 'Test',
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce same fingerprint regardless of casing', () => {
    const fp1 = generateOpportunityFingerprint({
      company: 'EXAMPLE CORP',
      title: 'Software Intern',
    });
    const fp2 = generateOpportunityFingerprint({
      company: 'example corp',
      title: 'software intern',
    });
    expect(fp1).toBe(fp2);
  });

  it('should produce same fingerprint regardless of extra whitespace', () => {
    const fp1 = generateOpportunityFingerprint({
      company: '  Example  Corp  ',
      title: 'Software  Intern',
    });
    const fp2 = generateOpportunityFingerprint({
      company: 'Example Corp',
      title: 'Software Intern',
    });
    expect(fp1).toBe(fp2);
  });

  it('should produce same fingerprint regardless of URL trailing slash', () => {
    const fp1 = generateOpportunityFingerprint({
      title: 'Test',
      apply_url: 'https://example.com/apply/',
    });
    const fp2 = generateOpportunityFingerprint({
      title: 'Test',
      apply_url: 'https://example.com/apply',
    });
    expect(fp1).toBe(fp2);
  });

  it('should produce different fingerprints for different inputs', () => {
    const fp1 = generateOpportunityFingerprint({
      company: 'Corp A',
      title: 'Intern',
    });
    const fp2 = generateOpportunityFingerprint({
      company: 'Corp B',
      title: 'Intern',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('should handle all null/undefined fields', () => {
    const fp = generateOpportunityFingerprint({});
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle partial fields (some null)', () => {
    const fp = generateOpportunityFingerprint({
      company: null,
      title: 'Hackathon',
      location: undefined,
      apply_url: 'https://example.com',
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce identical fingerprint for same opportunity from different sources', () => {
    // Simulates duplicate detection across sources
    const source1 = generateOpportunityFingerprint({
      company: 'Google',
      title: 'STEP Internship',
      location: 'Bangalore',
      apply_url: 'https://example.com/google-step',
    });
    const source2 = generateOpportunityFingerprint({
      company: 'google',
      title: 'STEP  Internship',
      location: 'bangalore',
      apply_url: 'https://example.com/google-step/',
    });
    expect(source1).toBe(source2);
  });
});

describe('generateContentHash', () => {
  it('should generate a deterministic hash', () => {
    const h1 = generateContentHash('test content');
    const h2 = generateContentHash('test content');
    expect(h1).toBe(h2);
  });

  it('should return a 64-character hex string', () => {
    const hash = generateContentHash('hello');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different hashes for different content', () => {
    const h1 = generateContentHash('content A');
    const h2 = generateContentHash('content B');
    expect(h1).not.toBe(h2);
  });
});
