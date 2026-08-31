/**
 * Tests for opportunity Zod validation schema.
 */

import { describe, it, expect } from 'vitest';
import { CreateOpportunitySchema } from '../../src/domain/schemas.js';

describe('CreateOpportunitySchema', () => {
  const validOpportunity = {
    category: 'internship' as const,
    opportunity_type: 'internship' as const,
    title: 'Software Engineering Intern',
    company: 'Example Corp',
    location: 'Remote',
    work_mode: 'remote' as const,
    apply_url: 'https://example.com/apply',
  };

  it('should accept a valid opportunity with all fields', () => {
    const result = CreateOpportunitySchema.safeParse(validOpportunity);
    expect(result.success).toBe(true);
  });

  it('should accept a minimal opportunity (only required fields)', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'hackathon',
      opportunity_type: 'hackathon',
      title: 'Demo Hackathon',
    });

    expect(result.success).toBe(true);
  });

  it('should reject missing title', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'internship',
      opportunity_type: 'internship',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const titleError = result.error.issues.find((i) => i.path.includes('title'));
      expect(titleError).toBeDefined();
    }
  });

  it('should reject empty title', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'internship',
      opportunity_type: 'internship',
      title: '',
    });

    expect(result.success).toBe(false);
  });

  it('should reject whitespace-only title', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'internship',
      opportunity_type: 'internship',
      title: '   ',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing category', () => {
    const result = CreateOpportunitySchema.safeParse({
      opportunity_type: 'internship',
      title: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid category', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'invalid_category',
      opportunity_type: 'internship',
      title: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid opportunity_type', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'internship',
      opportunity_type: 'not_a_type',
      title: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should accept all valid categories', () => {
    const categories = [
      'internship',
      'job',
      'hackathon',
      'certification',
      'event',
      'workshop',
      'bootcamp',
      'scholarship',
      'competition',
      'other',
    ];

    for (const category of categories) {
      const result = CreateOpportunitySchema.safeParse({
        category,
        opportunity_type: category,
        title: 'Test',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid work_mode', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      work_mode: 'invalid_mode',
    });

    expect(result.success).toBe(false);
  });

  it('should accept null/undefined for optional fields', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'job',
      opportunity_type: 'job',
      title: 'Developer',
      company: null,
      location: null,
      work_mode: null,
      eligibility: null,
      stipend: null,
      salary: null,
      deadline: null,
      description: null,
      apply_url: null,
    });

    expect(result.success).toBe(true);
  });

  it('should reject invalid apply_url format', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      apply_url: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('should accept valid URL for apply_url', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      apply_url: 'https://example.com/apply?ref=hacknotify',
    });

    expect(result.success).toBe(true);
  });

  it('should reject ai_confidence outside 0-1 range', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      ai_confidence: 1.5,
    });

    expect(result.success).toBe(false);
  });

  it('should reject negative ai_confidence', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      ai_confidence: -0.1,
    });

    expect(result.success).toBe(false);
  });

  it('should accept ai_confidence within 0-1', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      ai_confidence: 0.87,
    });

    expect(result.success).toBe(true);
  });

  it('should default verification_status to pending', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'job',
      opportunity_type: 'job',
      title: 'Test',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.verification_status).toBe('pending');
    }
  });

  it('should default publication_status to unpublished', () => {
    const result = CreateOpportunitySchema.safeParse({
      category: 'job',
      opportunity_type: 'job',
      title: 'Test',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publication_status).toBe('unpublished');
    }
  });

  it('should coerce deadline string to Date', () => {
    const result = CreateOpportunitySchema.safeParse({
      ...validOpportunity,
      deadline: '2024-12-31T23:59:59Z',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deadline).toBeInstanceOf(Date);
    }
  });
});
