/**
 * Zod validation schemas for domain entities.
 *
 * These schemas serve as the application-level validation layer,
 * complementing database-level CHECK constraints.
 */

import { z } from 'zod';
import {
  SOURCE_PLATFORMS,
  SOURCE_MESSAGE_STATUSES,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_TYPES,
  VERIFICATION_STATUSES,
  PUBLICATION_STATUSES,
  WORK_MODES,
} from './enums.js';

// ─── Shared Refinements ──────────────────────────────────────────────────────

/** Non-empty trimmed string. */
const nonEmptyString = z.string().trim().min(1, 'Must not be empty');

/** Optional URL — validates format only when present. */
const optionalUrl = z.string().url().nullish();

// ─── Source Channel ──────────────────────────────────────────────────────────

export const CreateSourceChannelSchema = z.object({
  name: nonEmptyString,
  platform: z.enum(SOURCE_PLATFORMS),
  external_channel_id: z.string().nullish(),
  channel_url: optionalUrl,
  description: z.string().nullish(),
  enabled: z.boolean().default(true),
});

export type CreateSourceChannelInput = z.infer<typeof CreateSourceChannelSchema>;

// ─── Source Ingestion Schemas ────────────────────────────────────────────────

export const SourceFetchOptionsSchema = z.object({
  cursor: z.string().nullish(),
  since: z.coerce.date().nullish(),
  limit: z.number().int().positive().max(100).optional(),
});

export type SourceFetchOptionsInput = z.infer<typeof SourceFetchOptionsSchema>;

export const RawSourceMessageSchema = z.object({
  externalMessageId: z.string().nullish(),
  rawText: z.string().nullish(),
  sourceUrl: optionalUrl,
  mediaUrl: optionalUrl,
  messageTimestamp: z.coerce.date().nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

export type RawSourceMessageInput = z.infer<typeof RawSourceMessageSchema>;

// ─── Source Message ──────────────────────────────────────────────────────────

export const CreateSourceMessageSchema = z.object({
  source_channel_id: z.string().uuid(),
  external_message_id: z.string().nullish(),
  raw_text: z.string().nullish(),
  source_url: optionalUrl,
  media_url: optionalUrl,
  message_timestamp: z.coerce.date().nullish(),
  content_hash: nonEmptyString,
  processed: z.boolean().default(false),
  processing_status: z.enum(SOURCE_MESSAGE_STATUSES).default('pending'),
  processing_error: z.string().nullish(),
});

export type CreateSourceMessageInput = z.infer<typeof CreateSourceMessageSchema>;

// ─── Opportunity ─────────────────────────────────────────────────────────────

export const CreateOpportunitySchema = z.object({
  source_message_id: z.string().uuid().nullish(),
  category: z.enum(OPPORTUNITY_CATEGORIES),
  opportunity_type: z.enum(OPPORTUNITY_TYPES),
  company: z.string().nullish(),
  title: nonEmptyString,
  location: z.string().nullish(),
  work_mode: z.enum(WORK_MODES).nullish(),
  eligibility: z.string().nullish(),
  graduation_year: z.string().nullish(),
  experience: z.string().nullish(),
  stipend: z.string().nullish(),
  salary: z.string().nullish(),
  deadline: z.coerce.date().nullish(),
  description: z.string().nullish(),
  apply_url: optionalUrl,
  source_url: optionalUrl,
  ai_confidence: z.number().min(0).max(1).nullish(),
  verification_status: z.enum(VERIFICATION_STATUSES).default('pending'),
  publication_status: z.enum(PUBLICATION_STATUSES).default('unpublished'),
  generated_post: z.string().nullish(),
  opportunity_fingerprint: z.string().nullish(),
});

export type CreateOpportunityInput = z.infer<typeof CreateOpportunitySchema>;

// ─── Update Schemas (partial, for PATCH-style updates) ───────────────────────

export const UpdateVerificationStatusSchema = z.object({
  verification_status: z.enum(VERIFICATION_STATUSES),
});

export const UpdatePublicationStatusSchema = z.object({
  publication_status: z.enum(PUBLICATION_STATUSES),
  published_at: z.coerce.date().nullish(),
  generated_post: z.string().nullish(),
});
