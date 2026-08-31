/**
 * Tests for opportunity normalization utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCleanString,
  normalizeCleanUrl,
  normalizeCleanDate,
  normalizeExtractedOpportunity,
} from '../../src/utils/normalization.js';
import type { GeminiExtractionResponse } from '../../src/ai/gemini/gemini.schemas.js';

describe('normalizeCleanString', () => {
  it('should trim and collapse internal whitespace', () => {
    expect(normalizeCleanString('  Amazon   Web   Services  ')).toBe('Amazon Web Services');
  });

  it('should return null for empty string or whitespace only', () => {
    expect(normalizeCleanString('')).toBeNull();
    expect(normalizeCleanString('   ')).toBeNull();
  });

  it('should return null for null or undefined', () => {
    expect(normalizeCleanString(null)).toBeNull();
    expect(normalizeCleanString(undefined)).toBeNull();
  });
});

describe('normalizeCleanUrl', () => {
  it('should normalize valid URLs', () => {
    expect(normalizeCleanUrl('HTTPS://EXAMPLE.COM/Apply/')).toBe('https://example.com/apply');
  });

  it('should preserve query parameters and fragments', () => {
    const url = 'https://example.com/apply?ref=hacknotify#section';
    expect(normalizeCleanUrl(url)).toBe(url);
  });

  it('should return null for invalid URL string', () => {
    expect(normalizeCleanUrl('not-a-url')).toBeNull();
    expect(normalizeCleanUrl('ftp://unsupported')).toBeNull();
  });

  it('should return null for null or empty string', () => {
    expect(normalizeCleanUrl(null)).toBeNull();
    expect(normalizeCleanUrl('')).toBeNull();
  });
});

describe('normalizeCleanDate', () => {
  it('should parse valid ISO date strings', () => {
    const parsed = normalizeCleanDate('2025-03-31T23:59:59Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getUTCFullYear()).toBe(2025);
  });

  it('should parse YYYY-MM-DD date strings', () => {
    const parsed = normalizeCleanDate('2025-12-31');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getUTCFullYear()).toBe(2025);
  });

  it('should return null for invalid date strings', () => {
    expect(normalizeCleanDate('not-a-date')).toBeNull();
    expect(normalizeCleanDate('')).toBeNull();
    expect(normalizeCleanDate(null)).toBeNull();
  });
});

describe('normalizeExtractedOpportunity', () => {
  const baseExtraction: GeminiExtractionResponse = {
    is_opportunity: true,
    title: '  Software   Engineering Intern  ',
    company: '  Amazon  ',
    organization: null,
    category: 'internship',
    opportunity_type: 'internship',
    description: '  Great internship role  ',
    location: ' Bangalore ',
    work_mode: 'remote',
    stipend: ' ₹1,00,000/month ',
    salary: null,
    eligibility: ' 2026 Batch ',
    graduation_year: ' 2026 ',
    experience_required: ' Freshers ',
    deadline: '2025-03-31T00:00:00Z',
    event_date: null,
    apply_url: 'https://example.com/amazon-apply/',
    registration_url: null,
    source_url: 'https://example.com/source',
    skills: ['Node.js'],
    tags: ['internship'],
    confidence: 0.92,
    reasoning_summary: 'Clear internship',
  };

  it('should normalize all fields cleanly', () => {
    const result = normalizeExtractedOpportunity(baseExtraction);

    expect(result.title).toBe('Software Engineering Intern');
    expect(result.company).toBe('Amazon');
    expect(result.location).toBe('Bangalore');
    expect(result.work_mode).toBe('remote');
    expect(result.stipend).toBe('₹1,00,000/month');
    expect(result.eligibility).toBe('2026 Batch');
    expect(result.apply_url).toBe('https://example.com/amazon-apply');
    expect(result.deadline).toBeInstanceOf(Date);
    expect(result.ai_confidence).toBe(0.92);
    expect(result.verification_status).toBe('pending');
    expect(result.publication_status).toBe('unpublished');
    expect(result.opportunity_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should fallback to organization if company is null', () => {
    const extraction: GeminiExtractionResponse = {
      ...baseExtraction,
      company: null,
      organization: '  GDG Bangalore  ',
    };

    const result = normalizeExtractedOpportunity(extraction);
    expect(result.company).toBe('GDG Bangalore');
  });

  it('should fallback to registration_url if apply_url is null', () => {
    const extraction: GeminiExtractionResponse = {
      ...baseExtraction,
      apply_url: null,
      registration_url: 'https://example.com/register/',
    };

    const result = normalizeExtractedOpportunity(extraction);
    expect(result.apply_url).toBe('https://example.com/register');
  });

  it('should generate identical fingerprint for opportunities with minor whitespace/casing variations', () => {
    const ext1: GeminiExtractionResponse = {
      ...baseExtraction,
      company: 'Amazon India',
      title: 'SDE Intern',
      location: 'Bangalore',
      apply_url: 'https://example.com/apply/',
    };

    const ext2: GeminiExtractionResponse = {
      ...baseExtraction,
      company: '  amazon   india  ',
      title: '  sde  intern  ',
      location: 'bangalore',
      apply_url: 'https://example.com/apply',
    };

    const res1 = normalizeExtractedOpportunity(ext1);
    const res2 = normalizeExtractedOpportunity(ext2);

    expect(res1.opportunity_fingerprint).toBe(res2.opportunity_fingerprint);
  });

  it('should clamp confidence within [0, 1]', () => {
    const extLow = { ...baseExtraction, confidence: -0.5 };
    const extHigh = { ...baseExtraction, confidence: 1.5 };

    expect(normalizeExtractedOpportunity(extLow).ai_confidence).toBe(0);
    expect(normalizeExtractedOpportunity(extHigh).ai_confidence).toBe(1);
  });
});
