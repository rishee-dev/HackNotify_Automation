/**
 * Deterministic opportunity fingerprinting for duplicate detection.
 *
 * Generates a stable hash from normalized opportunity fields so
 * the same opportunity from different sources produces the same fingerprint.
 *
 * Normalization steps:
 *  1. Lowercase
 *  2. Trim whitespace
 *  3. Collapse internal whitespace
 *  4. Normalize URLs (strip trailing slashes, lowercase protocol/host)
 *  5. SHA-256 hash of concatenated fields
 */

import { createHash } from 'node:crypto';

/**
 * Normalize a text field for fingerprinting.
 * Returns empty string for null/undefined input.
 */
function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normalize a URL for fingerprinting.
 * Strips trailing slashes, lowercases protocol and host.
 * Returns empty string for null/undefined input.
 */
function normalizeUrl(value: string | null | undefined): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    // Lowercase protocol and host, preserve pathname case
    const normalized =
      `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`.replace(/\/+$/, ''); // strip trailing slashes
    return normalized.toLowerCase();
  } catch {
    // If it's not a valid URL, treat it as plain text
    return normalizeText(value);
  }
}

export interface FingerprintInput {
  company?: string | null;
  title?: string | null;
  location?: string | null;
  apply_url?: string | null;
}

/**
 * Generate a deterministic SHA-256 fingerprint for duplicate detection.
 *
 * The same opportunity details will always produce the same fingerprint,
 * regardless of whitespace, casing, or URL formatting differences.
 */
export function generateOpportunityFingerprint(input: FingerprintInput): string {
  const parts = [
    normalizeText(input.company),
    normalizeText(input.title),
    normalizeText(input.location),
    normalizeUrl(input.apply_url),
  ];

  const combined = parts.join('|');
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Generate a SHA-256 content hash for raw message deduplication.
 */
export function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Export normalization functions for testing
export { normalizeText, normalizeUrl };
