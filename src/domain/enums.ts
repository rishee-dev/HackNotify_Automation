/**
 * Domain enums for HackNotify Autopilot.
 *
 * These are the single source of truth for all controlled vocabulary
 * used across the application. Database CHECK constraints mirror these values.
 */

// ─── Source Platforms ────────────────────────────────────────────────────────

/** Platforms from which HackNotify may ingest opportunity data. */
export const SOURCE_PLATFORMS = [
  'whatsapp',
  'telegram',
  'website',
  'rss',
  'manual',
  'campus_leader',
  'other',
] as const;

export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

// ─── Source Message Processing ───────────────────────────────────────────────

/** Processing lifecycle of an ingested source message. */
export const SOURCE_MESSAGE_STATUSES = [
  'pending',
  'processing',
  'processed',
  'failed',
  'ignored',
] as const;

export type SourceMessageStatus = (typeof SOURCE_MESSAGE_STATUSES)[number];

// ─── Opportunity Categories ──────────────────────────────────────────────────

/** High-level category of a technology opportunity. */
export const OPPORTUNITY_CATEGORIES = [
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
] as const;

export type OpportunityCategory = (typeof OPPORTUNITY_CATEGORIES)[number];

// ─── Opportunity Types (alias for category in current model) ─────────────────

/**
 * Opportunity type — currently mirrors categories.
 * Kept as a separate type so future phases can diverge
 * (e.g. "full-time" vs "part-time" within the "job" category).
 */
export const OPPORTUNITY_TYPES = [...OPPORTUNITY_CATEGORIES] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

// ─── Work Mode ───────────────────────────────────────────────────────────────

export const WORK_MODES = ['remote', 'onsite', 'hybrid', 'flexible', 'other'] as const;

export type WorkMode = (typeof WORK_MODES)[number];

// ─── Verification Status ─────────────────────────────────────────────────────

/** Admin verification lifecycle for an opportunity. */
export const VERIFICATION_STATUSES = [
  'pending',
  'verified',
  'rejected',
  'needs_review',
  'expired',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// ─── Publication Status ──────────────────────────────────────────────────────

/** Publication lifecycle — tracks whether a post has been pushed to channels. */
export const PUBLICATION_STATUSES = ['unpublished', 'queued', 'published', 'failed'] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
