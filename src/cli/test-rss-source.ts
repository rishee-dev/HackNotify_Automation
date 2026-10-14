/**
 * CLI Smoke Test Helper for RSS Source Adapter.
 *
 * Fetches and parses the live RSS feed without requiring a database,
 * Gemini AI, or publishing channels.
 *
 * Usage:
 *   npm run source:test:rss
 *   npx tsx src/cli/test-rss-source.ts
 */

import { RssSourceAdapter, DEFAULT_RSS_FEED_URL } from '../sources/adapters/rss-source.adapter.js';

async function run(): Promise<void> {
  console.log('====================================================');
  console.log('⚡ HackNotify RSS Source Test');
  console.log('====================================================\n');

  const feedUrl = process.argv[2] || DEFAULT_RSS_FEED_URL;

  console.log(`Source:    WeWorkRemotely Programming Jobs`);
  console.log(`Feed URL:  ${feedUrl}`);
  console.log(`\n⏳ Fetching and parsing RSS feed...\n`);

  try {
    const adapter = new RssSourceAdapter({
      identifier: 'weworkremotely_programming',
      feedUrl,
      timeoutMs: 15000,
    });

    const result = await adapter.fetchNewMessages({ limit: 5 });

    console.log('====================================================');
    console.log(`Fetched:   ${result.messages.length} items`);
    if (result.metadata?.totalItemsInFeed !== undefined) {
      console.log(`Total in Feed: ${result.metadata.totalItemsInFeed}`);
    }
    console.log(`Has More:  ${result.hasMore ? 'Yes' : 'No'}`);
    if (result.nextCursor) {
      console.log(`Next Cursor: ${result.nextCursor}`);
    }
    console.log('====================================================\n');

    result.messages.forEach((msg, idx) => {
      console.log(`----------------------------------------------------`);
      console.log(`Item ${idx + 1}:`);
      console.log(`External ID: ${msg.externalMessageId ?? 'N/A'}`);
      console.log(
        `Published:   ${msg.messageTimestamp ? msg.messageTimestamp.toISOString() : 'N/A'}`,
      );
      console.log(`Source URL:  ${msg.sourceUrl ?? 'N/A'}`);
      if (msg.metadata?.categories) {
        console.log(`Categories:  ${JSON.stringify(msg.metadata.categories)}`);
      }
      if (msg.metadata?.region) {
        console.log(`Region:      ${msg.metadata.region}`);
      }
      const preview = (msg.rawText ?? '').slice(0, 200).replace(/\n+/g, ' ');
      console.log(`Raw Text:    ${preview}...`);
    });

    console.log('----------------------------------------------------\n');
    console.log('✅ RSS Source Ingestion Test Completed Successfully.');
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`❌ RSS feed test failed: ${errorMessage}`);
    process.exit(1);
  }
}

run();
