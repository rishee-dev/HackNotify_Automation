/**
 * Structured logger.
 *
 * Provides consistent, level-aware logging without leaking secrets.
 * Wraps console methods with structured JSON output in production
 * and human-readable output in development.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

/** Fields that must NEVER appear in logs. */
const REDACTED_FIELDS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'supabase_service_role_key',
  'api_key',
]);

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (REDACTED_FIELDS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED]';
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

function createEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? redact(meta) : {}),
  };
}

function write(entry: LogEntry): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const output = isProduction
    ? JSON.stringify(entry)
    : `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.message}${
        Object.keys(entry).length > 3 ? ' ' + JSON.stringify(redact(entry), null, 2) : ''
      }`;

  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    write(createEntry('debug', message, meta));
  },
  info(message: string, meta?: Record<string, unknown>): void {
    write(createEntry('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    write(createEntry('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    write(createEntry('error', message, meta));
  },
};
