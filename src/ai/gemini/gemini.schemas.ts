/**
 * Schemas for Gemini structured output and post-response Zod validation.
 *
 * Uses the existing Phase 1 domain enums to ensure consistency
 * across the entire application.
 */

import { z } from 'zod';
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_TYPES, WORK_MODES } from '../../domain/enums.js';

// ─── Zod Schema for Gemini Output Validation ─────────────────────────────────

export const GeminiExtractionResponseSchema = z.object({
  is_opportunity: z.boolean(),
  title: z.string().trim().nullish(),
  company: z.string().trim().nullish(),
  organization: z.string().trim().nullish(),
  category: z.enum(OPPORTUNITY_CATEGORIES).default('other'),
  opportunity_type: z.enum(OPPORTUNITY_TYPES).default('other'),
  description: z.string().trim().nullish(),
  location: z.string().trim().nullish(),
  work_mode: z.enum(WORK_MODES).nullish(),
  stipend: z.string().trim().nullish(),
  salary: z.string().trim().nullish(),
  eligibility: z.string().trim().nullish(),
  graduation_year: z.string().trim().nullish(),
  experience_required: z.string().trim().nullish(),
  deadline: z.string().trim().nullish(),
  event_date: z.string().trim().nullish(),
  apply_url: z.string().trim().nullish(),
  registration_url: z.string().trim().nullish(),
  source_url: z.string().trim().nullish(),
  skills: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  reasoning_summary: z.string().trim().nullish(),
});

export type GeminiExtractionResponse = z.infer<typeof GeminiExtractionResponseSchema>;

// ─── JSON Schema for Gemini SDK responseSchema ───────────────────────────────

/**
 * OpenAPI 3.0 compatible JSON schema passed to @google/genai generateContent
 * to enforce structured output at generation time.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    is_opportunity: {
      type: 'boolean',
      description:
        'Whether the text describes a genuine technology opportunity for students/developers.',
    },
    title: {
      type: 'string',
      description:
        'Official title or role name of the opportunity. Null if not an opportunity or unspecified.',
      nullable: true,
    },
    company: {
      type: 'string',
      description: 'Company or hiring entity offering the opportunity. Null if unspecified.',
      nullable: true,
    },
    organization: {
      type: 'string',
      description: 'Hosting community, university, or organizing body. Null if unspecified.',
      nullable: true,
    },
    category: {
      type: 'string',
      enum: [...OPPORTUNITY_CATEGORIES],
      description: 'High-level category of the opportunity.',
    },
    opportunity_type: {
      type: 'string',
      enum: [...OPPORTUNITY_TYPES],
      description: 'Type of opportunity.',
    },
    description: {
      type: 'string',
      description: 'Concise summary of the opportunity based only on provided facts.',
      nullable: true,
    },
    location: {
      type: 'string',
      description: 'Specific city, state, or location mentioned. Null if unspecified.',
      nullable: true,
    },
    work_mode: {
      type: 'string',
      enum: [...WORK_MODES],
      description: 'Work mode if specified.',
      nullable: true,
    },
    stipend: {
      type: 'string',
      description: 'Exact stated stipend phrasing (e.g. "₹25,000/month"). Null if unspecified.',
      nullable: true,
    },
    salary: {
      type: 'string',
      description: 'Exact stated compensation/CTC phrasing (e.g. "6-8 LPA"). Null if unspecified.',
      nullable: true,
    },
    eligibility: {
      type: 'string',
      description:
        'Stated eligibility criteria (e.g. "B.Tech CSE, 3rd/4th year"). Null if unspecified.',
      nullable: true,
    },
    graduation_year: {
      type: 'string',
      description: 'Target passing/graduation batch (e.g. "2025/2026"). Null if unspecified.',
      nullable: true,
    },
    experience_required: {
      type: 'string',
      description: 'Required experience level (e.g. "Freshers", "0-1 years"). Null if unspecified.',
      nullable: true,
    },
    deadline: {
      type: 'string',
      description: 'Application deadline or expiry date mentioned. Null if unspecified.',
      nullable: true,
    },
    event_date: {
      type: 'string',
      description: 'Date/time when the event/hackathon/workshop takes place. Null if unspecified.',
      nullable: true,
    },
    apply_url: {
      type: 'string',
      description: 'Direct link to apply for the role/opportunity. Null if not present.',
      nullable: true,
    },
    registration_url: {
      type: 'string',
      description: 'Link to register for the event/hackathon/workshop. Null if not present.',
      nullable: true,
    },
    source_url: {
      type: 'string',
      description: 'Original post URL or reference link if mentioned.',
      nullable: true,
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Key technical skills or technologies mentioned in the post.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Relevant tags (e.g. "ai", "webdev", "fresher", "remote").',
    },
    confidence: {
      type: 'number',
      description: 'Confidence score from 0.0 to 1.0 representing extraction certainty.',
    },
    reasoning_summary: {
      type: 'string',
      description:
        'Brief 1-line explanation of why this was or was not classified as an opportunity.',
      nullable: true,
    },
  },
  required: ['is_opportunity', 'category', 'opportunity_type', 'skills', 'tags', 'confidence'],
} as const;
