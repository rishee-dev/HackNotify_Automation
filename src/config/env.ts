/**
 * Typed environment configuration with Zod validation.
 *
 * Application startup fails immediately if required environment
 * variables are missing or malformed. This prevents silent failures
 * from undefined credentials.
 */

import { config } from 'dotenv';
import { z } from 'zod';

// Load .env file (no-op in production where env vars are injected)
config();

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY must not be empty'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY must not be empty').optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate environment variables.
 * Throws a descriptive error listing all missing/invalid vars on failure.
 */
function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `❌ Environment validation failed:\n${formatted}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }

  return result.data;
}

/** Validated environment configuration. Accessing this triggers validation. */
let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = loadEnv();
  }
  return _env;
}

/**
 * Get the validated Gemini API key.
 * Throws a clear error if the key is not set in environment.
 */
export function getGeminiApiKey(): string {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) {
    throw new Error(
      '❌ GEMINI_API_KEY is not set in environment variables. Set GEMINI_API_KEY in .env to use AI features.',
    );
  }
  return env.GEMINI_API_KEY;
}

/**
 * Reset cached env — used only in tests.
 * @internal
 */
export function _resetEnvCache(): void {
  _env = null;
}
