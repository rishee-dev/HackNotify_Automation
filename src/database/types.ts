/**
 * Database row types for Supabase.
 *
 * These mirror the PostgreSQL schema and are used for typed
 * Supabase client queries. They represent what the database
 * actually stores (as opposed to domain input schemas which
 * represent what the application accepts).
 */

import type {
  SourcePlatform,
  SourceMessageStatus,
  OpportunityCategory,
  OpportunityType,
  VerificationStatus,
  PublicationStatus,
} from '../domain/enums.js';

// ─── Source Channels ─────────────────────────────────────────────────────────

export interface SourceChannelRow {
  id: string;
  name: string;
  platform: SourcePlatform;
  external_channel_id: string | null;
  channel_url: string | null;
  description: string | null;
  enabled: boolean;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceChannelInsert {
  id?: string;
  name: string;
  platform: SourcePlatform;
  external_channel_id?: string | null;
  channel_url?: string | null;
  description?: string | null;
  enabled?: boolean;
  last_checked_at?: string | null;
}

// ─── Source Messages ─────────────────────────────────────────────────────────

export interface SourceMessageRow {
  id: string;
  source_channel_id: string;
  external_message_id: string | null;
  raw_text: string | null;
  source_url: string | null;
  media_url: string | null;
  message_timestamp: string | null;
  content_hash: string;
  processed: boolean;
  processing_status: SourceMessageStatus;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceMessageInsert {
  id?: string;
  source_channel_id: string;
  external_message_id?: string | null;
  raw_text?: string | null;
  source_url?: string | null;
  media_url?: string | null;
  message_timestamp?: string | null;
  content_hash: string;
  processed?: boolean;
  processing_status?: SourceMessageStatus;
  processing_error?: string | null;
}

// ─── Opportunities ───────────────────────────────────────────────────────────

export interface OpportunityRow {
  id: string;
  source_message_id: string | null;
  category: OpportunityCategory;
  opportunity_type: OpportunityType;
  company: string | null;
  title: string;
  location: string | null;
  work_mode: string | null;
  eligibility: string | null;
  graduation_year: string | null;
  experience: string | null;
  stipend: string | null;
  salary: string | null;
  deadline: string | null;
  description: string | null;
  apply_url: string | null;
  source_url: string | null;
  ai_confidence: number | null;
  verification_status: VerificationStatus;
  publication_status: PublicationStatus;
  generated_post: string | null;
  opportunity_fingerprint: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityInsert {
  id?: string;
  source_message_id?: string | null;
  category: OpportunityCategory;
  opportunity_type: OpportunityType;
  company?: string | null;
  title: string;
  location?: string | null;
  work_mode?: string | null;
  eligibility?: string | null;
  graduation_year?: string | null;
  experience?: string | null;
  stipend?: string | null;
  salary?: string | null;
  deadline?: string | null;
  description?: string | null;
  apply_url?: string | null;
  source_url?: string | null;
  ai_confidence?: number | null;
  verification_status?: VerificationStatus;
  publication_status?: PublicationStatus;
  generated_post?: string | null;
  opportunity_fingerprint?: string | null;
}

// ─── Supabase Database Type Map ──────────────────────────────────────────────

/**
 * Supabase expects a typed database definition.
 * This maps table names to Row/Insert/Update types.
 * Relationships are required by the GenericTable constraint.
 *
 * NOTE: We omit the Database generic from createClient and instead
 * use typed helper methods in repositories. This avoids complex
 * generic resolution issues with hand-crafted types.
 */
export type Database = {
  public: {
    Tables: {
      source_channels: {
        Row: SourceChannelRow;
        Insert: SourceChannelInsert;
        Update: Partial<SourceChannelInsert>;
        Relationships: [];
      };
      source_messages: {
        Row: SourceMessageRow;
        Insert: SourceMessageInsert;
        Update: Partial<SourceMessageInsert>;
        Relationships: [
          {
            foreignKeyName: 'source_messages_source_channel_id_fkey';
            columns: ['source_channel_id'];
            isOneToOne: false;
            referencedRelation: 'source_channels';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunities: {
        Row: OpportunityRow;
        Insert: OpportunityInsert;
        Update: Partial<OpportunityInsert>;
        Relationships: [
          {
            foreignKeyName: 'opportunities_source_message_id_fkey';
            columns: ['source_message_id'];
            isOneToOne: false;
            referencedRelation: 'source_messages';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
