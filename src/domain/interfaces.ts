/**
 * Future-proofing interfaces for pluggable pipeline components.
 *
 * These contracts define the boundaries between pipeline stages.
 * Phase 1 provides only the interfaces — implementations come in later phases.
 */

import type { SourcePlatform } from './enums.js';
import type { CreateOpportunityInput } from './schemas.js';

// ─── Source Interface ────────────────────────────────────────────────────────

/** A raw message fetched from an external source. */
export interface RawSourceMessage {
  externalMessageId?: string | null;
  rawText?: string | null;
  sourceUrl?: string | null;
  mediaUrl?: string | null;
  messageTimestamp?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/** Options for fetching messages from an external source. */
export interface SourceFetchOptions {
  cursor?: string | null;
  since?: Date | null;
  limit?: number;
}

/** Result returned by a source adapter after fetching messages. */
export interface SourceFetchResult {
  messages: RawSourceMessage[];
  nextCursor?: string | null;
  hasMore?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Represents an external source adapter that can fetch raw opportunity messages.
 *
 * Source adapters are responsible ONLY for fetching and normalizing raw messages.
 * They do NOT perform AI extraction, verification, duplicate resolution, or publishing.
 */
export interface OpportunitySource {
  readonly platform: SourcePlatform;
  readonly identifier: string;
  fetchNewMessages(options?: SourceFetchOptions): Promise<SourceFetchResult>;
}

/**
 * Normalized internal representation of an ingested source message
 * before persistence to the database.
 */
export interface NormalizedSourceMessage {
  sourceChannelId: string;
  externalMessageId?: string | null;
  rawText: string;
  sourceUrl?: string | null;
  mediaUrl?: string | null;
  messageTimestamp?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Summary metrics of a single source channel ingestion run.
 */
export interface SourceIngestionResult {
  sourceChannelId: string;
  sourceName: string;
  platform: SourcePlatform;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  fetched: number;
  inserted: number;
  duplicates: number;
  failed: number;
  durationMs: number;
  error?: string;
}

/**
 * Provider interface for external messaging channels (e.g. WhatsApp, Telegram).
 * Providers must use authorized APIs only (no scraping or browser automation).
 */
export interface ChannelProvider {
  readonly providerName: string;
  fetchChannelMessages(channelId: string, options?: SourceFetchOptions): Promise<SourceFetchResult>;
}

// ─── Analyzer Interface ──────────────────────────────────────────────────────

/** Result of AI analysis on a raw message. */
export interface AnalysisResult {
  opportunities: CreateOpportunityInput[];
  confidence: number;
  isOpportunity?: boolean;
  reasoningSummary?: string | null;
  analyzerVersion?: string;
  modelName?: string;
  rawResponse?: string;
}

/**
 * Analyzes raw text to extract structured opportunity data.
 *
 * Future implementations:
 *  - GeminiOpportunityAnalyzer (Phase 2)
 */
export interface OpportunityAnalyzer {
  readonly analyzerVersion?: string;
  analyze(rawText: string, fallbackSourceUrl?: string | null): Promise<AnalysisResult>;
}

// ─── Publisher Interface ─────────────────────────────────────────────────────

/** Result of a publish attempt. */
export interface PublishResult {
  success: boolean;
  publishedAt?: Date;
  externalPostId?: string;
  error?: string;
}

/**
 * Publishes formatted opportunity posts to a channel.
 *
 * Future implementations:
 *  - WhatsAppChannelPublisher (Phase 5)
 *  - TelegramChannelPublisher
 */
export interface OpportunityPublisher {
  publish(formattedPost: string): Promise<PublishResult>;
}
