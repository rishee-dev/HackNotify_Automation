-- ============================================================================
-- HackNotify Autopilot — Phase 1 Database Migration
-- ============================================================================
-- Creates the core tables, constraints, indexes, triggers, and RLS policies
-- for the opportunity processing pipeline.
--
-- Run via: supabase db push   OR   supabase migration up
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. REUSABLE updated_at TRIGGER FUNCTION
-- ────────────────────────────────────────────────────────────────────────────
-- Automatically sets updated_at to now() on any UPDATE.
-- Applied to every table that has an updated_at column.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. SOURCE_CHANNELS TABLE
-- ────────────────────────────────────────────────────────────────────────────
-- Represents external sources that HackNotify may monitor for opportunities.

CREATE TABLE IF NOT EXISTS public.source_channels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  platform            TEXT NOT NULL,
  external_channel_id TEXT,
  channel_url         TEXT,
  description         TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  last_checked_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Platform must be one of the supported values
  CONSTRAINT source_channels_platform_check CHECK (
    platform IN ('whatsapp', 'telegram', 'website', 'rss', 'manual', 'campus_leader', 'other')
  ),

  -- Unique per-platform external ID (only enforced when not null)
  CONSTRAINT source_channels_platform_external_id_unique
    UNIQUE (platform, external_channel_id)
);

-- Trigger: auto-update updated_at
CREATE TRIGGER source_channels_updated_at
  BEFORE UPDATE ON public.source_channels
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 3. SOURCE_MESSAGES TABLE
-- ────────────────────────────────────────────────────────────────────────────
-- Stores raw incoming messages/content from external sources.

CREATE TABLE IF NOT EXISTS public.source_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_channel_id   UUID NOT NULL REFERENCES public.source_channels(id) ON DELETE CASCADE,
  external_message_id TEXT,
  raw_text            TEXT,
  source_url          TEXT,
  media_url           TEXT,
  message_timestamp   TIMESTAMPTZ,
  content_hash        TEXT NOT NULL,
  processed           BOOLEAN NOT NULL DEFAULT false,
  processing_status   TEXT NOT NULL DEFAULT 'pending',
  processing_error    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Processing status must be one of the supported values
  CONSTRAINT source_messages_processing_status_check CHECK (
    processing_status IN ('pending', 'processing', 'processed', 'failed', 'ignored')
  ),

  -- Unique message per source channel (only enforced when external_message_id is not null)
  CONSTRAINT source_messages_channel_external_id_unique
    UNIQUE (source_channel_id, external_message_id)
);

-- Indexes for common query patterns
-- FK lookups: list messages by source channel
CREATE INDEX IF NOT EXISTS idx_source_messages_source_channel_id
  ON public.source_messages (source_channel_id);

-- Duplicate detection: find by content hash
CREATE INDEX IF NOT EXISTS idx_source_messages_content_hash
  ON public.source_messages (content_hash);

-- Processing queue: find unprocessed messages
CREATE INDEX IF NOT EXISTS idx_source_messages_processing_status
  ON public.source_messages (processing_status)
  WHERE processing_status IN ('pending', 'processing');

-- Chronological queries: order by message timestamp
CREATE INDEX IF NOT EXISTS idx_source_messages_message_timestamp
  ON public.source_messages (message_timestamp DESC NULLS LAST);

-- Simple boolean filter for unprocessed
CREATE INDEX IF NOT EXISTS idx_source_messages_processed
  ON public.source_messages (processed)
  WHERE processed = false;

-- Trigger: auto-update updated_at
CREATE TRIGGER source_messages_updated_at
  BEFORE UPDATE ON public.source_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. OPPORTUNITIES TABLE
-- ────────────────────────────────────────────────────────────────────────────
-- Central business entity: a structured technology opportunity.

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_message_id       UUID REFERENCES public.source_messages(id) ON DELETE SET NULL,
  category                TEXT NOT NULL,
  opportunity_type        TEXT NOT NULL,
  company                 TEXT,
  title                   TEXT NOT NULL,
  location                TEXT,
  work_mode               TEXT,
  eligibility             TEXT,
  graduation_year         TEXT,
  experience              TEXT,
  stipend                 TEXT,
  salary                  TEXT,
  deadline                TIMESTAMPTZ,
  description             TEXT,
  apply_url               TEXT,
  source_url              TEXT,
  ai_confidence           NUMERIC,
  verification_status     TEXT NOT NULL DEFAULT 'pending',
  publication_status      TEXT NOT NULL DEFAULT 'unpublished',
  generated_post          TEXT,
  opportunity_fingerprint TEXT,
  published_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Category validation
  CONSTRAINT opportunities_category_check CHECK (
    category IN (
      'internship', 'job', 'hackathon', 'certification', 'event',
      'workshop', 'bootcamp', 'scholarship', 'competition', 'other'
    )
  ),

  -- Opportunity type validation
  CONSTRAINT opportunities_type_check CHECK (
    opportunity_type IN (
      'internship', 'job', 'hackathon', 'certification', 'event',
      'workshop', 'bootcamp', 'scholarship', 'competition', 'other'
    )
  ),

  -- Work mode validation (nullable)
  CONSTRAINT opportunities_work_mode_check CHECK (
    work_mode IS NULL OR work_mode IN ('remote', 'onsite', 'hybrid', 'flexible', 'other')
  ),

  -- Verification status validation
  CONSTRAINT opportunities_verification_status_check CHECK (
    verification_status IN ('pending', 'verified', 'rejected', 'needs_review', 'expired')
  ),

  -- Publication status validation
  CONSTRAINT opportunities_publication_status_check CHECK (
    publication_status IN ('unpublished', 'queued', 'published', 'failed')
  ),

  -- AI confidence must be between 0 and 1 when present
  CONSTRAINT opportunities_ai_confidence_range CHECK (
    ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)
  )
);

-- Indexes for common query patterns

-- Category filtering: browse by category
CREATE INDEX IF NOT EXISTS idx_opportunities_category
  ON public.opportunities (category);

-- Admin review queue: find by verification status
CREATE INDEX IF NOT EXISTS idx_opportunities_verification_status
  ON public.opportunities (verification_status);

-- Publishing queue: find by publication status
CREATE INDEX IF NOT EXISTS idx_opportunities_publication_status
  ON public.opportunities (publication_status);

-- Company search
CREATE INDEX IF NOT EXISTS idx_opportunities_company
  ON public.opportunities (company)
  WHERE company IS NOT NULL;

-- Deadline tracking: find opportunities expiring soon
CREATE INDEX IF NOT EXISTS idx_opportunities_deadline
  ON public.opportunities (deadline ASC NULLS LAST)
  WHERE deadline IS NOT NULL;

-- Duplicate detection: fingerprint lookup
CREATE INDEX IF NOT EXISTS idx_opportunities_fingerprint
  ON public.opportunities (opportunity_fingerprint)
  WHERE opportunity_fingerprint IS NOT NULL;

-- Chronological listing
CREATE INDEX IF NOT EXISTS idx_opportunities_created_at
  ON public.opportunities (created_at DESC);

-- Trigger: auto-update updated_at
CREATE TRIGGER opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 5. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────────────────
-- Enable RLS on all business tables.
-- No permissive policies are created — the backend uses the service-role key
-- which bypasses RLS. This ensures that if the anon key or any other
-- client-side key is accidentally used, no data is exposed.

ALTER TABLE public.source_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities   ENABLE ROW LEVEL SECURITY;

-- No public/anon policies. Access is only through the service-role key.
-- Future phases may add specific policies for admin dashboard access.
