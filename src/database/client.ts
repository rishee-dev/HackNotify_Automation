/**
 * Supabase client singleton.
 *
 * Uses the service-role key for server-side operations.
 * This key must NEVER be exposed to frontend/client code.
 *
 * NOTE: We don't pass the Database generic to createClient because
 * hand-crafted types don't satisfy Supabase's GenericSchema index
 * signature requirement. Instead, repositories use typed casts on
 * individual query results. This is the pragmatic approach when
 * types are not generated via `supabase gen types`.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';

let _client: SupabaseClient | null = null;

/**
 * Get the singleton Supabase client.
 * Initializes on first call using validated environment variables.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const env = getEnv();

    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        // Service-role key bypasses RLS by default.
        // We keep autoRefreshToken off — this is a server-side key.
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    logger.info('Supabase client initialized', { url: env.SUPABASE_URL });
  }

  return _client;
}

/**
 * Reset the client — used only in tests.
 * @internal
 */
export function _resetSupabaseClient(): void {
  _client = null;
}
