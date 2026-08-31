/**
 * Tests for domain enum definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  SOURCE_PLATFORMS,
  SOURCE_MESSAGE_STATUSES,
  OPPORTUNITY_CATEGORIES,
  OPPORTUNITY_TYPES,
  VERIFICATION_STATUSES,
  PUBLICATION_STATUSES,
  WORK_MODES,
} from '../../src/domain/enums.js';

describe('Domain Enums', () => {
  it('should define all source platforms', () => {
    expect(SOURCE_PLATFORMS).toContain('whatsapp');
    expect(SOURCE_PLATFORMS).toContain('telegram');
    expect(SOURCE_PLATFORMS).toContain('website');
    expect(SOURCE_PLATFORMS).toContain('rss');
    expect(SOURCE_PLATFORMS).toContain('manual');
    expect(SOURCE_PLATFORMS).toContain('campus_leader');
    expect(SOURCE_PLATFORMS).toContain('other');
    expect(SOURCE_PLATFORMS).toHaveLength(7);
  });

  it('should define all source message statuses', () => {
    expect(SOURCE_MESSAGE_STATUSES).toContain('pending');
    expect(SOURCE_MESSAGE_STATUSES).toContain('processing');
    expect(SOURCE_MESSAGE_STATUSES).toContain('processed');
    expect(SOURCE_MESSAGE_STATUSES).toContain('failed');
    expect(SOURCE_MESSAGE_STATUSES).toContain('ignored');
    expect(SOURCE_MESSAGE_STATUSES).toHaveLength(5);
  });

  it('should define all opportunity categories', () => {
    expect(OPPORTUNITY_CATEGORIES).toContain('internship');
    expect(OPPORTUNITY_CATEGORIES).toContain('job');
    expect(OPPORTUNITY_CATEGORIES).toContain('hackathon');
    expect(OPPORTUNITY_CATEGORIES).toContain('certification');
    expect(OPPORTUNITY_CATEGORIES).toContain('event');
    expect(OPPORTUNITY_CATEGORIES).toContain('workshop');
    expect(OPPORTUNITY_CATEGORIES).toContain('bootcamp');
    expect(OPPORTUNITY_CATEGORIES).toContain('scholarship');
    expect(OPPORTUNITY_CATEGORIES).toContain('competition');
    expect(OPPORTUNITY_CATEGORIES).toContain('other');
    expect(OPPORTUNITY_CATEGORIES).toHaveLength(10);
  });

  it('should have opportunity types matching categories', () => {
    // Currently opportunity types mirror categories
    expect([...OPPORTUNITY_TYPES]).toEqual([...OPPORTUNITY_CATEGORIES]);
  });

  it('should define all verification statuses', () => {
    expect(VERIFICATION_STATUSES).toContain('pending');
    expect(VERIFICATION_STATUSES).toContain('verified');
    expect(VERIFICATION_STATUSES).toContain('rejected');
    expect(VERIFICATION_STATUSES).toContain('needs_review');
    expect(VERIFICATION_STATUSES).toContain('expired');
    expect(VERIFICATION_STATUSES).toHaveLength(5);
  });

  it('should define all publication statuses', () => {
    expect(PUBLICATION_STATUSES).toContain('unpublished');
    expect(PUBLICATION_STATUSES).toContain('queued');
    expect(PUBLICATION_STATUSES).toContain('published');
    expect(PUBLICATION_STATUSES).toContain('failed');
    expect(PUBLICATION_STATUSES).toHaveLength(4);
  });

  it('should define all work modes', () => {
    expect(WORK_MODES).toContain('remote');
    expect(WORK_MODES).toContain('onsite');
    expect(WORK_MODES).toContain('hybrid');
    expect(WORK_MODES).toContain('flexible');
    expect(WORK_MODES).toContain('other');
    expect(WORK_MODES).toHaveLength(5);
  });
});
