# HackNotify Automation

**Backend automation platform for HackNotify India** — a student technology opportunity community.

HackNotify Automation collects opportunities from external channels, analyzes them with AI, verifies them, detects duplicates, generates formatted posts, and publishes approved opportunities.

---

## Roadmap & Status

| Phase       | Scope                                                   | Status      |
| ----------- | ------------------------------------------------------- | ----------- |
| **Phase 1** | Production-Grade Backend Foundation & Supabase Database | ✅ Complete |
| **Phase 2** | Gemini AI Opportunity Extraction & Classification       | ✅ Complete |
| **Phase 3** | Admin Verification & Advanced Duplicate Resolution      | 🔮 Planned  |
| **Phase 4** | Source Ingestion & Opportunity Collection Engine        | ✅ Complete |
| **Phase 5** | Multi-Channel Publishing Pipeline                       | 🔮 Planned  |
| **Phase 6** | Admin Dashboard & Review UI                             | 🔮 Planned  |

> **⚠️ Important Business Rule**: **Extraction ≠ Verification ≠ Publishing**.
> Ingestion brings external content into `source_messages` as `pending`. Gemini AI extracts and structures opportunities downstream. Verification (`verification_status`) and publishing (`publication_status`) remain strictly gated stages. **Phase 4 does NOT publish anything.**

---

## Phase 4 Architecture — Source Ingestion Engine

Phase 4 introduces the **Source Ingestion & Opportunity Collection Engine** that brings external content into the HackNotify pipeline:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   External Source (Fixture / API / RSS)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Source Adapter (OpportunitySource Contract)             │
│                                                                        │
│  - Polymorphic adapters registered in SourceRegistry                   │
│  - Bounded transient retries with exponential backoff (max 2 retries)  │
│  - Rejects immediately on 401/403/invalid configuration                 │
│  - Evaluates timestamp checkpoints (since: last_checked_at)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Normalized Raw Source Message                        │
│                                                                        │
│  - Preserves raw source text exactly as received (no LLM rewriting)    │
│  - Preserves exact source URLs and media URLs                          │
│  - Calculates deterministic SHA-256 raw content hash                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 Dual-Layer Idempotent Ingestion Check                  │
│                                                                        │
│  1. Check source_channel_id + external_message_id                      │
│  2. Check content_hash across existing messages                        │
│  3. Check intra-batch duplicate tracker                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  Duplicate Found? ─┴─► YES ──► Log Duplicate Event (Skip Insert)
                                    │
                                   NO
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Persist Source Message (SourceMessagesRepository.create)       │
│                                                                        │
│  - processing_status: 'pending'                                        │
│  - processed: false                                                    │
│  - content_hash & external_message_id stored                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Update Checkpoint (source_channels.last_checked_at)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Downstream: Phase 2 AI Analysis                       │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Tenets of Phase 4

1. **Source Error Isolation**: Every source channel is ingested in an isolated execution block. If one external channel fails (e.g. timeout or 401), healthy sources continue processing uninterrupted.
2. **Dual-Layer Idempotency**: Messages are checked against both `(source_channel_id, external_message_id)` and the SHA-256 `content_hash` before insertion. Running ingestion repeatedly against the same source produces zero duplicate rows.
3. **Inert Data Security**: Untrusted source text is stored as raw inert data strings. Ingestion never executes or evaluates external instructions.
4. **Authorized Messaging Providers Only**: Unofficial WhatsApp scraping, QR session hacking, and browser automation are strictly prohibited. The system defines a pluggable `ChannelProvider` interface ready for official Meta WhatsApp Cloud API / Telegram Bot API integrations.

---

## Phase 2 Architecture — AI Extraction Pipeline

Phase 2 provides the downstream **Gemini AI Opportunity Extraction & Classification** layer:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Source Message (Pending)                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Claim & Lock Message (processing_status: processing)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         OpportunityAnalyzer Adapter (GeminiOpportunityAnalyzer)        │
│                                                                        │
│  - Injects System Instructions (OPPORTUNITY_EXTRACTION_PROMPT_V1)      │
│  - Enforces Prompt Injection Defense (inert untrusted data parsing)    │
│  - Enforces Structured JSON Output via responseSchema                  │
│  - Applies bounded exponential backoff on transient errors (429/503)   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Post-Generation Zod Validation (GeminiExtractionSchema)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                     Is Opportunity? ───────► NO ──► Mark Message Processed
                                    │
                                   YES
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Data Normalization & Sanitization (normalizeExtracted)          │
│                                                                        │
│  - Trim & collapse internal whitespace                                 │
│  - Organization fallback for company                                   │
│  - URL normalization (lowercase host/protocol, strip trailing slash)   │
│  - Date parsing & validation                                           │
│  - Confidence score clamping [0.0, 1.0]                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Deterministic Fingerprint Generation (SHA-256)                  │
│                                                                        │
│  SHA-256(company | title | location | apply_url)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
             Duplicate Exists in DB? ───────► YES ──► Log Duplicate Event
                                    │                 Mark Message Processed
                                   NO
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│         Persist Opportunity (OpportunitiesRepository.create)           │
│                                                                        │
│  - verification_status: pending                                        │
│  - publication_status: unpublished                                     │
│  - source_message_id linked                                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          Mark Source Message Processed (processed: true)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
hacknotify-Automation/
├── fixtures/
│   └── messages/                     # Synthetic test fixtures for local analysis
│       ├── internship-amazon.txt
│       ├── job-google.txt
│       ├── hackathon-ethindia.txt
│       ├── certification-aws.txt
│       ├── event-devfest.txt
│       ├── non-opportunity-greeting.txt
│       ├── ambiguous-opportunity.txt
│       ├── prompt-injection.txt
│       └── duplicate-opportunity.txt
│
├── src/
│   ├── ai/
│   │   ├── ai.errors.ts              # Domain AI error hierarchy (RateLimit, Timeout, etc.)
│   │   ├── gemini/
│   │   │   ├── gemini.client.ts      # @google/genai SDK wrapper with retries & timeout
│   │   │   ├── gemini.opportunity-analyzer.ts # OpportunityAnalyzer implementation
│   │   │   ├── gemini.prompts.ts     # Versioned system prompts & injection defense
│   │   │   └── gemini.schemas.ts     # Zod schema & OpenAPI responseSchema
│   │   └── index.ts
│   │
│   ├── cli/
│   │   ├── analyze-fixture.ts        # CLI tool for local fixture extraction testing
│   │   └── ingest-fixture.ts         # CLI tool for testing source ingestion engine
│   │
│   ├── config/
│   │   ├── env.ts                    # Zod-validated environment config
│   │   ├── logger.ts                 # Structured logger with automatic secret redaction
│   │   └── index.ts
│   │
│   ├── database/
│   │   ├── client.ts                 # Supabase client singleton
│   │   ├── types.ts                  # PostgreSQL schema types
│   │   ├── repositories/
│   │   │   ├── source-channels.repository.ts
│   │   │   ├── source-messages.repository.ts
│   │   │   └── opportunities.repository.ts
│   │   └── index.ts
│   │
│   ├── domain/
│   │   ├── enums.ts                  # Single source of truth for domain enums
│   │   ├── schemas.ts                # Zod schemas for database entities & ingestion
│   │   ├── interfaces.ts             # Pluggable pipeline contracts (OpportunitySource, etc.)
│   │   └── index.ts
│   │
│   ├── services/
│   │   ├── health.service.ts         # Connectivity health check
│   │   ├── opportunity-analysis.service.ts # Pipeline orchestration & deduplication
│   │   ├── source-ingestion.service.ts     # Source polling, checkpointing & ingestion
│   │   └── index.ts
│   │
│   ├── sources/
│   │   ├── adapters/
│   │   │   └── fixture-source.adapter.ts   # Deterministic test fixture adapter
│   │   ├── providers/
│   │   │   └── channel-provider.interface.ts # Authorized messaging provider contracts
│   │   ├── utils/
│   │   │   └── retry.ts              # Bounded exponential backoff retry utility
│   │   ├── source.registry.ts        # Polymorphic source adapter registry
│   │   └── index.ts
│   │
│   ├── utils/
│   │   ├── fingerprint.ts            # SHA-256 deterministic fingerprinting & content hashing
│   │   ├── normalization.ts          # Text, URL, date cleaning & normalization
│   │   └── index.ts
│   │
│   └── index.ts                      # Application entry point
│
├── supabase/
│   ├── migrations/                   # PostgreSQL schema migrations
│   └── seed.sql                      # Safe development seed data
│
├── tests/                            # Comprehensive Vitest test suite
│   ├── ai/
│   ├── config/
│   ├── domain/
│   ├── services/
│   ├── sources/
│   └── utils/
│
├── .env.example
├── package.json
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env`:

| Variable                    | Required    | Description                                                                 |
| --------------------------- | ----------- | --------------------------------------------------------------------------- |
| `SUPABASE_URL`              | ✅          | Supabase project API URL (e.g. `https://xxxx.supabase.co`)                  |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅          | Server-side Service Role Key (kept secret)                                  |
| `GEMINI_API_KEY`            | ⚡ (For AI) | Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL`              | ❌          | Gemini model identifier (defaults to `gemini-2.5-flash`)                    |
| `NODE_ENV`                  | ❌          | `development` (default), `production`, or `test`                            |

---

## Development & CLI Commands

```bash
# Test source message ingestion using the deterministic fixture source
npm run ingest:test

# Analyze a test fixture locally with Gemini AI
npm run analyze:test
# Or specify a custom fixture file:
npx tsx src/cli/analyze-fixture.ts fixtures/messages/hackathon-ethindia.txt

# Run all automated tests (fully mocked, no external network needed)
npm run test

# Run tests in watch mode
npm run test:watch

# TypeScript type checking
npm run typecheck

# ESLint check
npm run lint

# Prettier code formatting
npm run format
npm run format:check

# Compile production bundle
npm run build
```

---

## Security & Prompt Injection Defense

1. **Inert Data Isolation**: External source messages are treated strictly as inert data strings. Ingestion never executes or parses source content as configuration or code.
2. **Prompt Injection Defense**: When analyzed by Gemini in Phase 2, system instructions command the model to ignore user override attempts.
3. **Post-Generation Zod Validation**: Never trust raw LLM output. Responses must pass strict Zod schema parsing before being normalized.
4. **Automatic Secret Redaction**: The structured logger automatically scrubs keys, tokens, auth headers, and secrets before writing to stdout.
5. **Row Level Security (RLS)**: Enforced across all Supabase tables.

---

## Features Intentionally NOT Implemented (Scope Control)

The following capabilities belong to later phases:

- ❌ Unofficial WhatsApp Web scraping / QR session automation (Prohibited by architecture)
- ❌ Direct WhatsApp or Telegram publishing (Phase 5)
- ❌ Automated public posting to social media (Phase 5)
- ❌ Admin review web UI & dashboard (Phase 6)
- ❌ Automatic verification bypass (Verification remains mandatory in Phase 3)
