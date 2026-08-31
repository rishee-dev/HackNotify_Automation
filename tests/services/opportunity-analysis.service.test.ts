/**
 * Tests for OpportunityAnalysisService orchestration pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpportunityAnalysisService } from '../../src/services/opportunity-analysis.service.js';
import { SourceMessagesRepository } from '../../src/database/repositories/source-messages.repository.js';
import { OpportunitiesRepository } from '../../src/database/repositories/opportunities.repository.js';
import type { OpportunityAnalyzer, AnalysisResult } from '../../src/domain/interfaces.js';
import type { SourceMessageRow, OpportunityRow } from '../../src/database/types.js';

describe('OpportunityAnalysisService', () => {
  let mockSourceRepo: SourceMessagesRepository;
  let mockOppRepo: OpportunitiesRepository;
  let mockAnalyzer: OpportunityAnalyzer;
  let service: OpportunityAnalysisService;

  const sampleMessage: SourceMessageRow = {
    id: '10000000-0000-0000-0000-000000000001',
    source_channel_id: '00000000-0000-0000-0000-000000000001',
    external_message_id: 'msg_001',
    raw_text: 'Amazon is hiring SDE Interns for Summer 2025!',
    source_url: 'https://example.com/source',
    media_url: null,
    message_timestamp: '2025-01-15T10:00:00Z',
    content_hash: 'hash123',
    processed: false,
    processing_status: 'pending',
    processing_error: null,
    created_at: '2025-01-15T10:00:00Z',
    updated_at: '2025-01-15T10:00:00Z',
  };

  const sampleOpportunity: OpportunityRow = {
    id: '20000000-0000-0000-0000-000000000001',
    source_message_id: sampleMessage.id,
    category: 'internship',
    opportunity_type: 'internship',
    company: 'Amazon',
    title: 'SDE Intern',
    location: 'Bangalore',
    work_mode: 'hybrid',
    eligibility: '2026 Batch',
    graduation_year: '2026',
    experience: null,
    stipend: '₹1,10,000/month',
    salary: null,
    deadline: '2025-03-31T23:59:59.000Z',
    description: 'Summer internship role',
    apply_url: 'https://example.com/apply',
    source_url: 'https://example.com/source',
    ai_confidence: 0.95,
    verification_status: 'pending',
    publication_status: 'unpublished',
    generated_post: null,
    opportunity_fingerprint: 'sample_fingerprint_hash_64_characters_long_123456789012345678901234',
    published_at: null,
    created_at: '2025-01-15T10:05:00Z',
    updated_at: '2025-01-15T10:05:00Z',
  };

  beforeEach(() => {
    mockSourceRepo = {
      getMessageById: vi.fn(),
      listPendingMessages: vi.fn(),
      markMessageProcessing: vi.fn(),
      markMessageProcessed: vi.fn(),
      markMessageFailed: vi.fn(),
    } as unknown as SourceMessagesRepository;

    mockOppRepo = {
      createOpportunity: vi.fn(),
      findOpportunityByFingerprint: vi.fn(),
    } as unknown as OpportunitiesRepository;

    mockAnalyzer = {
      analyzerVersion: 'gemini-opportunity-v1',
      analyze: vi.fn(),
    };

    service = new OpportunityAnalysisService(mockSourceRepo, mockOppRepo, mockAnalyzer);
  });

  it('should successfully process a valid source message, claim it, and create opportunity', async () => {
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(sampleMessage);
    vi.mocked(mockOppRepo.findOpportunityByFingerprint).mockResolvedValueOnce(null);
    vi.mocked(mockOppRepo.createOpportunity).mockResolvedValueOnce(sampleOpportunity);

    const mockAnalysis: AnalysisResult = {
      isOpportunity: true,
      confidence: 0.95,
      opportunities: [
        {
          category: 'internship',
          opportunity_type: 'internship',
          title: 'SDE Intern',
          company: 'Amazon',
          location: 'Bangalore',
          work_mode: 'hybrid',
          stipend: '₹1,10,000/month',
          apply_url: 'https://example.com/apply',
          ai_confidence: 0.95,
          opportunity_fingerprint: sampleOpportunity.opportunity_fingerprint,
        },
      ],
    };
    vi.mocked(mockAnalyzer.analyze).mockResolvedValueOnce(mockAnalysis);

    const result = await service.processSourceMessage(sampleMessage.id);

    expect(result.status).toBe('created');
    expect(result.opportunityId).toBe(sampleOpportunity.id);
    expect(result.isDuplicate).toBe(false);
    expect(mockSourceRepo.markMessageProcessing).toHaveBeenCalledWith(sampleMessage.id);
    expect(mockOppRepo.createOpportunity).toHaveBeenCalledTimes(1);
    expect(mockSourceRepo.markMessageProcessed).toHaveBeenCalledWith(sampleMessage.id);
  });

  it('should detect duplicate opportunity and NOT create a new record', async () => {
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(sampleMessage);
    // Return existing opportunity on fingerprint lookup
    vi.mocked(mockOppRepo.findOpportunityByFingerprint).mockResolvedValueOnce(sampleOpportunity);

    const mockAnalysis: AnalysisResult = {
      isOpportunity: true,
      confidence: 0.95,
      opportunities: [
        {
          category: 'internship',
          opportunity_type: 'internship',
          title: 'SDE Intern',
          company: 'Amazon',
          opportunity_fingerprint: sampleOpportunity.opportunity_fingerprint,
        },
      ],
    };
    vi.mocked(mockAnalyzer.analyze).mockResolvedValueOnce(mockAnalysis);

    const result = await service.processSourceMessage(sampleMessage.id);

    expect(result.status).toBe('duplicate');
    expect(result.isDuplicate).toBe(true);
    expect(result.opportunityId).toBe(sampleOpportunity.id);
    expect(mockOppRepo.createOpportunity).not.toHaveBeenCalled();
    expect(mockSourceRepo.markMessageProcessed).toHaveBeenCalledWith(sampleMessage.id);
  });

  it('should skip already processed messages unless allowRetry is true', async () => {
    const processedMessage: SourceMessageRow = {
      ...sampleMessage,
      processed: true,
      processing_status: 'processed',
    };
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(processedMessage);

    const result = await service.processSourceMessage(processedMessage.id);

    expect(result.status).toBe('skipped');
    expect(mockSourceRepo.markMessageProcessing).not.toHaveBeenCalled();
    expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
  });

  it('should skip messages currently locked in processing status', async () => {
    const lockedMessage: SourceMessageRow = {
      ...sampleMessage,
      processing_status: 'processing',
    };
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(lockedMessage);

    const result = await service.processSourceMessage(lockedMessage.id);

    expect(result.status).toBe('skipped');
    expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
  });

  it('should mark message failed if raw_text is empty', async () => {
    const emptyMessage: SourceMessageRow = {
      ...sampleMessage,
      raw_text: '   ',
    };
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(emptyMessage);

    const result = await service.processSourceMessage(emptyMessage.id);

    expect(result.status).toBe('failed');
    expect(mockSourceRepo.markMessageFailed).toHaveBeenCalledWith(
      emptyMessage.id,
      expect.stringContaining('empty'),
    );
    expect(mockAnalyzer.analyze).not.toHaveBeenCalled();
  });

  it('should handle non-opportunity messages and mark message processed without creating opportunities', async () => {
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(sampleMessage);

    const nonOppAnalysis: AnalysisResult = {
      isOpportunity: false,
      confidence: 0.1,
      opportunities: [],
      reasoningSummary: 'Just a greeting',
    };
    vi.mocked(mockAnalyzer.analyze).mockResolvedValueOnce(nonOppAnalysis);

    const result = await service.processSourceMessage(sampleMessage.id);

    expect(result.status).toBe('non_opportunity');
    expect(mockOppRepo.createOpportunity).not.toHaveBeenCalled();
    expect(mockSourceRepo.markMessageProcessed).toHaveBeenCalledWith(sampleMessage.id);
  });

  it('should mark message failed and log error when AI analyzer throws an exception', async () => {
    vi.mocked(mockSourceRepo.getMessageById).mockResolvedValueOnce(sampleMessage);
    vi.mocked(mockAnalyzer.analyze).mockRejectedValueOnce(new Error('AI generation failed'));

    const result = await service.processSourceMessage(sampleMessage.id);

    expect(result.status).toBe('failed');
    expect(result.error).toContain('AI generation failed');
    expect(mockSourceRepo.markMessageFailed).toHaveBeenCalledWith(
      sampleMessage.id,
      'AI generation failed',
    );
    expect(mockOppRepo.createOpportunity).not.toHaveBeenCalled();
  });

  it('should process a batch of pending messages sequentially', async () => {
    const msg1 = { ...sampleMessage, id: '10000000-0000-0000-0000-000000000001' };
    const msg2 = { ...sampleMessage, id: '10000000-0000-0000-0000-000000000002' };

    vi.mocked(mockSourceRepo.listPendingMessages).mockResolvedValueOnce([msg1, msg2]);
    vi.mocked(mockSourceRepo.getMessageById)
      .mockResolvedValueOnce(msg1)
      .mockResolvedValueOnce(msg2);

    vi.mocked(mockAnalyzer.analyze).mockResolvedValue({
      isOpportunity: false,
      confidence: 0.1,
      opportunities: [],
    });

    const results = await service.processPendingMessages(2);

    expect(results).toHaveLength(2);
    expect(mockSourceRepo.listPendingMessages).toHaveBeenCalledWith(2);
  });
});
