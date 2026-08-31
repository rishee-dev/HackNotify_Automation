/**
 * Health check service.
 *
 * Verifies application and database connectivity.
 * Returns a structured result suitable for monitoring.
 */

import { getSupabaseClient } from '../database/client.js';
import { logger } from '../config/logger.js';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  database: 'connected' | 'disconnected';
  timestamp: string;
  uptime: number;
  error?: string;
}

/**
 * Run a health check against the application and Supabase.
 *
 * Performs a lightweight query to verify database connectivity.
 */
export async function checkHealth(): Promise<HealthCheckResult> {
  const timestamp = new Date().toISOString();
  const uptime = process.uptime();

  try {
    const client = getSupabaseClient();

    // Simple connectivity check — query a single row from source_channels
    // using limit(1). If the table doesn't exist yet, this still tests
    // that the Supabase connection itself is valid.
    const { error } = await client.from('source_channels').select('id').limit(1);

    if (error) {
      logger.warn('Health check: database query returned error', {
        error: error.message,
      });
      return {
        status: 'degraded',
        database: 'disconnected',
        timestamp,
        uptime,
        error: error.message,
      };
    }

    return {
      status: 'ok',
      database: 'connected',
      timestamp,
      uptime,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Health check failed', { error: message });

    return {
      status: 'error',
      database: 'disconnected',
      timestamp,
      uptime,
      error: message,
    };
  }
}
