/**
 * Tests for Gemini structured extraction schema and Zod validation.
 */

import { describe, it, expect } from 'vitest';
import {
  GeminiExtractionResponseSchema,
  GEMINI_RESPONSE_SCHEMA,
} from '../../src/ai/gemini/gemini.schemas.js';

describe('GeminiExtractionResponseSchema', () => {
  it('should accept a valid internship extraction', () => {
    const data = {
      is_opportunity: true,
      title: 'Software Development Intern',
      company: 'Amazon',
      organization: null,
      category: 'internship',
      opportunity_type: 'internship',
      description: 'Summer 2025 internship role',
      location: 'Bangalore',
      work_mode: 'hybrid',
      stipend: '₹1,10,000/month',
      salary: null,
      eligibility: '2026 Batch',
      graduation_year: '2026',
      experience_required: 'Freshers',
      deadline: '2025-03-31T23:59:59Z',
      event_date: null,
      apply_url: 'https://example.com/apply',
      registration_url: null,
      source_url: 'https://example.com/source',
      skills: ['Java', 'Data Structures'],
      tags: ['internship', 'tech', 'summer2025'],
      confidence: 0.95,
      reasoning_summary: 'Clear internship posting with explicit stipend and apply link',
    };

    const result = GeminiExtractionResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should accept non-opportunity extraction with minimal/null fields', () => {
    const data = {
      is_opportunity: false,
      title: null,
      company: null,
      organization: null,
      category: 'other',
      opportunity_type: 'other',
      description: null,
      location: null,
      work_mode: null,
      stipend: null,
      salary: null,
      eligibility: null,
      graduation_year: null,
      experience_required: null,
      deadline: null,
      event_date: null,
      apply_url: null,
      registration_url: null,
      source_url: null,
      skills: [],
      tags: [],
      confidence: 0.1,
      reasoning_summary: 'Good morning greeting text, not an opportunity',
    };

    const result = GeminiExtractionResponseSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject missing is_opportunity field', () => {
    const data = {
      title: 'Software Intern',
      category: 'internship',
    };

    const result = GeminiExtractionResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject invalid category not matching domain enums', () => {
    const data = {
      is_opportunity: true,
      category: 'unsupported_category_name',
      skills: [],
      tags: [],
    };

    const result = GeminiExtractionResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject confidence outside 0.0 to 1.0 range', () => {
    const data = {
      is_opportunity: true,
      category: 'job',
      confidence: 1.5,
      skills: [],
      tags: [],
    };

    const result = GeminiExtractionResponseSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should accept confidence boundary values 0.0 and 1.0', () => {
    const result0 = GeminiExtractionResponseSchema.safeParse({
      is_opportunity: false,
      category: 'other',
      confidence: 0.0,
      skills: [],
      tags: [],
    });
    expect(result0.success).toBe(true);

    const result1 = GeminiExtractionResponseSchema.safeParse({
      is_opportunity: true,
      category: 'hackathon',
      confidence: 1.0,
      skills: [],
      tags: [],
    });
    expect(result1.success).toBe(true);
  });

  it('should default skills and tags to empty arrays if omitted', () => {
    const result = GeminiExtractionResponseSchema.safeParse({
      is_opportunity: true,
      category: 'event',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skills).toEqual([]);
      expect(result.data.tags).toEqual([]);
    }
  });

  it('should provide a valid OpenAPI responseSchema object', () => {
    expect(GEMINI_RESPONSE_SCHEMA.type).toBe('object');
    expect(GEMINI_RESPONSE_SCHEMA.properties).toBeDefined();
    expect(GEMINI_RESPONSE_SCHEMA.required).toContain('is_opportunity');
    expect(GEMINI_RESPONSE_SCHEMA.required).toContain('category');
    expect(GEMINI_RESPONSE_SCHEMA.required).toContain('confidence');
  });
});
