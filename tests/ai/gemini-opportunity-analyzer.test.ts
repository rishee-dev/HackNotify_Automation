/**
 * Tests for GeminiOpportunityAnalyzer covering extraction, classification,
 * validation, normalization, and error cases with mocked GeminiClient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiOpportunityAnalyzer } from '../../src/ai/gemini/gemini.opportunity-analyzer.js';
import { GeminiClient } from '../../src/ai/gemini/gemini.client.js';
import { GeminiValidationError } from '../../src/ai/ai.errors.js';

describe('GeminiOpportunityAnalyzer', () => {
  let mockClient: GeminiClient;
  let analyzer: GeminiOpportunityAnalyzer;

  beforeEach(() => {
    mockClient = {
      generateStructuredContent: vi.fn(),
    } as unknown as GeminiClient;

    analyzer = new GeminiOpportunityAnalyzer(mockClient);
  });

  it('should return non-opportunity result for empty or whitespace-only source message', async () => {
    const result = await analyzer.analyze('   ');
    expect(result.isOpportunity).toBe(false);
    expect(result.opportunities).toHaveLength(0);
    expect(result.confidence).toBe(0);
    expect(mockClient.generateStructuredContent).not.toHaveBeenCalled();
  });

  it('should successfully extract and normalize a valid internship opportunity', async () => {
    const mockGeminiResponse = {
      is_opportunity: true,
      title: 'SDE Intern',
      company: 'Amazon',
      organization: null,
      category: 'internship',
      opportunity_type: 'internship',
      description: 'Summer 2025 internship',
      location: 'Bangalore / Hyderabad',
      work_mode: 'hybrid',
      stipend: '₹1,10,000 / month',
      salary: null,
      eligibility: '2026 Batch CS/IT',
      graduation_year: '2026',
      experience_required: 'Freshers',
      deadline: '2025-03-31T23:59:59Z',
      event_date: null,
      apply_url: 'https://example.com/amazon-sde-intern-2025',
      registration_url: null,
      source_url: null,
      skills: ['C++', 'Java'],
      tags: ['internship', 'summer2025'],
      confidence: 0.95,
      reasoning_summary: 'Clear internship posting with explicit stipend and apply URL',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockGeminiResponse),
      data: mockGeminiResponse,
      model: 'gemini-2.5-flash',
      durationMs: 450,
    });

    const result = await analyzer.analyze('Amazon is hiring SDE Interns...');

    expect(result.isOpportunity).toBe(true);
    expect(result.opportunities).toHaveLength(1);
    expect(result.confidence).toBe(0.95);

    const opp = result.opportunities[0];
    expect(opp.title).toBe('SDE Intern');
    expect(opp.company).toBe('Amazon');
    expect(opp.category).toBe('internship');
    expect(opp.work_mode).toBe('hybrid');
    expect(opp.stipend).toBe('₹1,10,000 / month');
    expect(opp.apply_url).toBe('https://example.com/amazon-sde-intern-2025');
    expect(opp.deadline).toBeInstanceOf(Date);
    expect(opp.opportunity_fingerprint).toBeDefined();
  });

  it('should successfully extract a full-time job opportunity', async () => {
    const mockJobResponse = {
      is_opportunity: true,
      title: 'Associate Software Engineer',
      company: 'Google',
      organization: null,
      category: 'job',
      opportunity_type: 'job',
      description: 'Junior engineer role',
      location: 'Pune, India',
      work_mode: 'onsite',
      stipend: null,
      salary: '18 - 24 LPA',
      eligibility: '2024 / 2025 graduates',
      graduation_year: '2025',
      experience_required: '0-1 years',
      deadline: '2025-04-15T00:00:00Z',
      event_date: null,
      apply_url: 'https://example.com/google-job',
      registration_url: null,
      source_url: null,
      skills: ['Go', 'Distributed Systems'],
      tags: ['job', 'fulltime'],
      confidence: 0.92,
      reasoning_summary: 'Full-time software engineering role',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockJobResponse),
      data: mockJobResponse,
      model: 'gemini-2.5-flash',
      durationMs: 380,
    });

    const result = await analyzer.analyze('Google is hiring Associate Software Engineers...');

    expect(result.isOpportunity).toBe(true);
    expect(result.opportunities[0].category).toBe('job');
    expect(result.opportunities[0].salary).toBe('18 - 24 LPA');
  });

  it('should successfully extract a hackathon opportunity', async () => {
    const mockHackathonResponse = {
      is_opportunity: true,
      title: 'ETHIndia 2025',
      company: null,
      organization: 'ETHGlobal',
      category: 'hackathon',
      opportunity_type: 'hackathon',
      description: 'Asia biggest ethereum hackathon',
      location: 'Bengaluru',
      work_mode: 'onsite',
      stipend: null,
      salary: null,
      eligibility: 'Open to all developers',
      graduation_year: null,
      experience_required: null,
      deadline: '2025-11-15T00:00:00Z',
      event_date: '2025-12-05',
      apply_url: null,
      registration_url: 'https://example.com/ethindia-register',
      source_url: null,
      skills: ['Solidity', 'Ethereum'],
      tags: ['hackathon', 'web3'],
      confidence: 0.96,
      reasoning_summary: 'Hackathon with registration link',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockHackathonResponse),
      data: mockHackathonResponse,
      model: 'gemini-2.5-flash',
      durationMs: 400,
    });

    const result = await analyzer.analyze('ETHIndia 2025 is here...');

    expect(result.isOpportunity).toBe(true);
    expect(result.opportunities[0].category).toBe('hackathon');
    expect(result.opportunities[0].company).toBe('ETHGlobal'); // fallback to organization
    expect(result.opportunities[0].apply_url).toBe('https://example.com/ethindia-register'); // fallback to registration_url
  });

  it('should successfully extract a certification opportunity', async () => {
    const mockCertResponse = {
      is_opportunity: true,
      title: 'AWS Certified Solutions Architect Voucher',
      company: 'Amazon Web Services',
      organization: null,
      category: 'certification',
      opportunity_type: 'certification',
      description: 'Free exam voucher',
      location: null,
      work_mode: null,
      stipend: null,
      salary: null,
      eligibility: 'College students',
      graduation_year: null,
      experience_required: null,
      deadline: '2025-06-30T00:00:00Z',
      event_date: null,
      apply_url: 'https://example.com/aws-voucher',
      registration_url: null,
      source_url: null,
      skills: ['AWS', 'Cloud'],
      tags: ['certification', 'free'],
      confidence: 0.88,
      reasoning_summary: 'Free certification voucher offer',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockCertResponse),
      data: mockCertResponse,
      model: 'gemini-2.5-flash',
      durationMs: 350,
    });

    const result = await analyzer.analyze('Free AWS certification voucher...');
    expect(result.opportunities[0].category).toBe('certification');
  });

  it('should successfully extract a tech event / conference', async () => {
    const mockEventResponse = {
      is_opportunity: true,
      title: 'DevFest Bengaluru 2025',
      company: null,
      organization: 'Google Developer Group Bangalore',
      category: 'event',
      opportunity_type: 'event',
      description: 'Annual tech summit',
      location: 'Bangalore',
      work_mode: 'onsite',
      stipend: null,
      salary: null,
      eligibility: null,
      graduation_year: null,
      experience_required: null,
      deadline: null,
      event_date: '2025-10-18',
      apply_url: 'https://example.com/devfest-register',
      registration_url: null,
      source_url: null,
      skills: ['Cloud', 'AI', 'Android'],
      tags: ['conference', 'meetup'],
      confidence: 0.9,
      reasoning_summary: 'Developer community conference',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockEventResponse),
      data: mockEventResponse,
      model: 'gemini-2.5-flash',
      durationMs: 320,
    });

    const result = await analyzer.analyze('DevFest Bengaluru is back...');
    expect(result.opportunities[0].category).toBe('event');
    expect(result.opportunities[0].company).toBe('Google Developer Group Bangalore');
  });

  it('should handle non-opportunity messages cleanly without creating opportunity records', async () => {
    const mockNonOppResponse = {
      is_opportunity: false,
      title: null,
      company: null,
      organization: null,
      category: 'other',
      opportunity_type: 'other',
      description: null,
      location: null,
      work_mode: null,
      stipend: null,
      salary: null,
      eligibility: null,
      graduation_year: null,
      experience_required: null,
      deadline: null,
      event_date: null,
      apply_url: null,
      registration_url: null,
      source_url: null,
      skills: [],
      tags: [],
      confidence: 0.1,
      reasoning_summary: 'Morning greeting and chitchat, not an opportunity',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockNonOppResponse),
      data: mockNonOppResponse,
      model: 'gemini-2.5-flash',
      durationMs: 210,
    });

    const result = await analyzer.analyze('Good morning everyone! Keep coding!');
    expect(result.isOpportunity).toBe(false);
    expect(result.opportunities).toHaveLength(0);
    expect(result.reasoningSummary).toContain('greeting');
  });

  it('should handle missing optional fields (company, location, deadline, stipend) with null preservation', async () => {
    const mockSparseResponse = {
      is_opportunity: true,
      title: 'Frontend React Developer',
      company: null,
      organization: null,
      category: 'job',
      opportunity_type: 'job',
      description: 'Looking for a React developer',
      location: null,
      work_mode: null,
      stipend: null,
      salary: null,
      eligibility: null,
      graduation_year: null,
      experience_required: null,
      deadline: null,
      event_date: null,
      apply_url: null,
      registration_url: null,
      source_url: null,
      skills: ['React'],
      tags: [],
      confidence: 0.55,
      reasoning_summary: 'Informal post with minimal details',
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockSparseResponse),
      data: mockSparseResponse,
      model: 'gemini-2.5-flash',
      durationMs: 290,
    });

    const result = await analyzer.analyze('Looking for React dev, DM if interested.');

    expect(result.isOpportunity).toBe(true);
    const opp = result.opportunities[0];
    expect(opp.company).toBeNull();
    expect(opp.location).toBeNull();
    expect(opp.deadline).toBeNull();
    expect(opp.stipend).toBeNull();
    expect(opp.apply_url).toBeNull();
  });

  it('should filter out invalid apply URLs during normalization', async () => {
    const mockResponseWithBadUrl = {
      is_opportunity: true,
      title: 'Dev Role',
      company: 'Test Corp',
      category: 'job',
      opportunity_type: 'job',
      apply_url: 'not-a-valid-url',
      confidence: 0.8,
      skills: [],
      tags: [],
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(mockResponseWithBadUrl),
      data: mockResponseWithBadUrl,
      model: 'gemini-2.5-flash',
      durationMs: 300,
    });

    const result = await analyzer.analyze('Test opportunity');
    expect(result.opportunities[0].apply_url).toBeNull();
  });

  it('should throw GeminiValidationError when output fails Zod schema validation', async () => {
    const invalidData = {
      is_opportunity: true,
      category: 'INVALID_ENUM_NAME', // invalid category
    };

    vi.mocked(mockClient.generateStructuredContent).mockResolvedValueOnce({
      rawText: JSON.stringify(invalidData),
      data: invalidData,
      model: 'gemini-2.5-flash',
      durationMs: 200,
    });

    await expect(analyzer.analyze('Some text')).rejects.toThrow(GeminiValidationError);
  });
});
