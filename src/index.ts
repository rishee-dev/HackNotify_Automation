/**
 * HackNotify Autopilot — Entry Point
 *
 * Phase 1: Backend foundation with Supabase database.
 * Validates environment, initializes the Supabase client,
 * and runs a health check to verify connectivity.
 */

import { getEnv, logger } from './config/index.js';
import { checkHealth } from './services/index.js';

async function main(): Promise<void> {
  logger.info('🚀 HackNotify Autopilot starting...');

  // Validate environment — will throw if missing/invalid
  try {
    const env = getEnv();
    logger.info('Environment validated', { nodeEnv: env.NODE_ENV });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Startup failed: environment validation error', { error: message });
    process.exit(1);
  }

  // Run health check
  const health = await checkHealth();
  logger.info('Health check result', {
    status: health.status,
    database: health.database,
  });

  if (health.status === 'error') {
    logger.error('Health check failed — cannot proceed', {
      error: health.error,
    });
    process.exit(1);
  }

  logger.info('✅ HackNotify Autopilot ready');
  logger.info('Phase 1 — Backend foundation operational');
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled error in main', { error: message });
  process.exit(1);
});
