/**
 * Opportunities repository.
 *
 * Central business entity operations including fingerprint-based
 * duplicate lookup, verification/publication status management.
 */

import { getSupabaseClient } from '../client.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../config/logger.js';
import type { OpportunityRow, OpportunityInsert } from '../types.js';
import type { VerificationStatus, PublicationStatus } from '../../domain/enums.js';

export class OpportunitiesRepository {
  private get db(): SupabaseClient {
    return getSupabaseClient();
  }

  /** Create a new opportunity. */
  async createOpportunity(data: OpportunityInsert): Promise<OpportunityRow> {
    const { data: opportunity, error } = await this.db
      .from('opportunities')
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create opportunity', {
        error: error.message,
        code: error.code,
      });
      throw new Error(`Failed to create opportunity: ${error.message}`);
    }

    return opportunity as OpportunityRow;
  }

  /** Get an opportunity by its UUID. */
  async getOpportunityById(id: string): Promise<OpportunityRow | null> {
    const { data: opportunity, error } = await this.db
      .from('opportunities')
      .select()
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('Failed to get opportunity', {
        error: error.message,
        id,
      });
      throw new Error(`Failed to get opportunity: ${error.message}`);
    }

    return opportunity as OpportunityRow;
  }

  /**
   * Find an opportunity by its deterministic fingerprint.
   * Used for duplicate detection across sources.
   */
  async findOpportunityByFingerprint(fingerprint: string): Promise<OpportunityRow | null> {
    const { data: opportunity, error } = await this.db
      .from('opportunities')
      .select()
      .eq('opportunity_fingerprint', fingerprint)
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('Failed to find opportunity by fingerprint', {
        error: error.message,
      });
      throw new Error(`Failed to find opportunity by fingerprint: ${error.message}`);
    }

    return opportunity as OpportunityRow;
  }

  /** List opportunities pending verification. */
  async listPendingOpportunities(): Promise<OpportunityRow[]> {
    const { data: opportunities, error } = await this.db
      .from('opportunities')
      .select()
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list pending opportunities', {
        error: error.message,
      });
      throw new Error(`Failed to list pending opportunities: ${error.message}`);
    }

    return (opportunities ?? []) as OpportunityRow[];
  }

  /** Update the verification status of an opportunity. */
  async updateVerificationStatus(id: string, status: VerificationStatus): Promise<void> {
    const { error } = await this.db
      .from('opportunities')
      .update({ verification_status: status })
      .eq('id', id);

    if (error) {
      logger.error('Failed to update verification status', {
        error: error.message,
        id,
        status,
      });
      throw new Error(`Failed to update verification status: ${error.message}`);
    }
  }

  /** Update the publication status of an opportunity. */
  async updatePublicationStatus(
    id: string,
    status: PublicationStatus,
    publishedAt?: Date,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      publication_status: status,
    };

    if (publishedAt) {
      updateData.published_at = publishedAt.toISOString();
    }

    const { error } = await this.db.from('opportunities').update(updateData).eq('id', id);

    if (error) {
      logger.error('Failed to update publication status', {
        error: error.message,
        id,
        status,
      });
      throw new Error(`Failed to update publication status: ${error.message}`);
    }
  }
}
