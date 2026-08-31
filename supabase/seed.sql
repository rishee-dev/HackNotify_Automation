-- ============================================================================
-- HackNotify Autopilot — Development Seed Data
-- ============================================================================
-- Safe demo data for local development. All URLs point to example.com.
-- DO NOT use in production. DO NOT mistake these for real opportunities.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Source Channels (3 demo channels)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.source_channels (id, name, platform, external_channel_id, channel_url, description)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '[DEMO] Hackathon Source',
    'telegram',
    'demo_hackathons_001',
    'https://example.com/channels/hackathons',
    'Demo channel — hackathon announcements. NOT a real source.'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '[DEMO] Careers Source',
    'whatsapp',
    'demo_careers_001',
    'https://example.com/channels/careers',
    'Demo channel — internship and job postings. NOT a real source.'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '[DEMO] Certifications Source',
    'website',
    NULL,
    'https://example.com/certifications',
    'Demo channel — certification opportunities. NOT a real source.'
  )
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- Source Messages (5 demo messages)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.source_messages (
  id, source_channel_id, external_message_id, raw_text,
  source_url, content_hash, processing_status, message_timestamp
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'msg_hack_001',
    '[DEMO DATA] 🚀 Example Hackathon 2024 — Build something amazing! Register at https://example.com/hackathon. Deadline: Dec 31, 2024.',
    'https://example.com/hackathon',
    'demo_hash_hackathon_001',
    'processed',
    '2024-01-15T10:00:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'msg_career_001',
    '[DEMO DATA] 💼 Example Corp is hiring Software Interns! Remote, stipend ₹25K/month. Apply: https://example.com/intern-apply',
    'https://example.com/intern-apply',
    'demo_hash_intern_001',
    'processed',
    '2024-01-16T14:30:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'msg_career_002',
    '[DEMO DATA] 🏢 Example Labs — Junior Developer Role. Bangalore, hybrid. 3+ LPA. Apply: https://example.com/job-apply',
    'https://example.com/job-apply',
    'demo_hash_job_001',
    'pending',
    '2024-01-17T09:15:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',
    NULL,
    '[DEMO DATA] 🎓 Free Google Cloud Certification — Enroll before Feb 2024. Link: https://example.com/gcp-cert',
    'https://example.com/gcp-cert',
    'demo_hash_cert_001',
    'processed',
    '2024-01-18T11:00:00Z'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'msg_hack_002',
    '[DEMO DATA] 🏆 Example University Coding Competition — Win ₹1L! Register: https://example.com/coding-comp',
    'https://example.com/coding-comp',
    'demo_hash_comp_001',
    'pending',
    '2024-01-19T16:45:00Z'
  )
ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- Opportunities (5 demo opportunities linked to messages above)
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.opportunities (
  id, source_message_id, category, opportunity_type,
  company, title, location, work_mode,
  eligibility, deadline, description,
  apply_url, source_url,
  verification_status, publication_status,
  opportunity_fingerprint
)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'hackathon', 'hackathon',
    'Example Org', '[DEMO] Example Hackathon 2024', 'Online', 'remote',
    'Open to all students', '2024-12-31T23:59:59Z',
    'Demo hackathon opportunity. NOT a real event.',
    'https://example.com/hackathon', 'https://example.com/hackathon',
    'verified', 'published',
    'demo_fingerprint_001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'internship', 'internship',
    'Example Corp', '[DEMO] Software Engineering Intern', 'Remote', 'remote',
    'B.Tech/BE students, 2024-2025 batch', '2024-03-15T23:59:59Z',
    'Demo internship opportunity. NOT a real position.',
    'https://example.com/intern-apply', 'https://example.com/intern-apply',
    'verified', 'unpublished',
    'demo_fingerprint_002'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'job', 'job',
    'Example Labs', '[DEMO] Junior Developer', 'Bangalore', 'hybrid',
    '2023-2024 graduates', '2024-02-28T23:59:59Z',
    'Demo job opportunity. NOT a real position.',
    'https://example.com/job-apply', 'https://example.com/job-apply',
    'pending', 'unpublished',
    'demo_fingerprint_003'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    'certification', 'certification',
    'Google', '[DEMO] Google Cloud Certification', 'Online', 'remote',
    'Open to everyone', '2024-02-29T23:59:59Z',
    'Demo certification opportunity. NOT a real certification offer.',
    'https://example.com/gcp-cert', 'https://example.com/gcp-cert',
    'verified', 'published',
    'demo_fingerprint_004'
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000005',
    'competition', 'competition',
    'Example University', '[DEMO] Coding Competition 2024', 'Delhi', 'onsite',
    'College students only', '2024-03-01T23:59:59Z',
    'Demo competition. NOT a real event.',
    'https://example.com/coding-comp', 'https://example.com/coding-comp',
    'needs_review', 'unpublished',
    'demo_fingerprint_005'
  )
ON CONFLICT DO NOTHING;
