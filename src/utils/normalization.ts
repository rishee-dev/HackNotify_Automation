/**
 * Data normalization utilities for extracted opportunities.
 *
 * Ensures deterministic formatting across text, URLs, and dates
 * before duplicate detection and database persistence.
 */

import { generateOpportunityFingerprint, normalizeUrl } from './fingerprint.js';
import type { GeminiExtractionResponse } from '../ai/gemini/gemini.schemas.js';
import type { CreateOpportunityInput } from '../domain/schemas.js';
import type { WorkMode } from '../domain/enums.js';

/**
 * Cleans a string by trimming and collapsing internal whitespace.
 * Returns null if the resulting string is empty or undefined.
 */
export function normalizeCleanString(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Normalizes a URL string.
 * Returns null if the URL is empty or invalid.
 */
export function normalizeCleanUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return normalizeUrl(trimmed);
  } catch {
    return null;
  }
}

/**
 * Normalizes a date string to a valid Date object.
 * Returns null if parsing fails or input is invalid.
 */
export function normalizeCleanDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Normalizes a Gemini extraction response into a strongly-typed
 * CreateOpportunityInput ready for database insertion and fingerprinting.
 */
export function normalizeExtractedOpportunity(
  extraction: GeminiExtractionResponse,
  fallbackSourceUrl?: string | null,
): CreateOpportunityInput {
  // Title is mandatory in our domain model
  const rawTitle = extraction.title || 'Untitled Opportunity';
  const title = normalizeCleanString(rawTitle) || 'Untitled Opportunity';

  // Company: prefer company, fallback to organization
  const rawCompany = extraction.company || extraction.organization;
  const company = normalizeCleanString(rawCompany);

  const location = normalizeCleanString(extraction.location);
  const workMode: WorkMode | null = extraction.work_mode || null;

  const stipend = normalizeCleanString(extraction.stipend);
  const salary = normalizeCleanString(extraction.salary);
  const eligibility = normalizeCleanString(extraction.eligibility);
  const graduationYear = normalizeCleanString(extraction.graduation_year);
  const experience = normalizeCleanString(extraction.experience_required);

  const deadline = normalizeCleanDate(extraction.deadline);
  const description = normalizeCleanString(extraction.description);

  // Apply URL: prefer apply_url, fallback to registration_url
  const rawApplyUrl = extraction.apply_url || extraction.registration_url;
  const applyUrl = normalizeCleanUrl(rawApplyUrl);

  // Source URL: prefer extraction.source_url, fallback to message source_url
  const rawSourceUrl = extraction.source_url || fallbackSourceUrl;
  const sourceUrl = normalizeCleanUrl(rawSourceUrl);

  // Clamp confidence to [0, 1]
  const rawConfidence = extraction.confidence ?? 0.5;
  const confidence = Math.max(0, Math.min(1, Number(rawConfidence.toFixed(2))));

  // Generate deterministic fingerprint
  const fingerprint = generateOpportunityFingerprint({
    company,
    title,
    location,
    apply_url: applyUrl,
  });

  return {
    category: extraction.category,
    opportunity_type: extraction.opportunity_type,
    company,
    title,
    location,
    work_mode: workMode,
    eligibility,
    graduation_year: graduationYear,
    experience,
    stipend,
    salary,
    deadline,
    description,
    apply_url: applyUrl,
    source_url: sourceUrl,
    ai_confidence: confidence,
    verification_status: 'pending',
    publication_status: 'unpublished',
    opportunity_fingerprint: fingerprint,
  };
}
