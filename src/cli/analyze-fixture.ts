/**
 * CLI Development Helper for Opportunity Analysis.
 *
 * Allows developers to test AI extraction locally against fixture files
 * without requiring database connectivity or messaging channels.
 *
 * Usage:
 *   npx tsx src/cli/analyze-fixture.ts [path/to/fixture.txt]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GeminiOpportunityAnalyzer } from '../ai/gemini/gemini.opportunity-analyzer.js';
import { logger } from '../config/logger.js';

async function run(): Promise<void> {
  const argPath = process.argv[2] || 'fixtures/messages/internship-amazon.txt';
  const fullPath = resolve(process.cwd(), argPath);

  if (!existsSync(fullPath)) {
    console.error(`❌ Fixture file not found: ${fullPath}`);
    process.exit(1);
  }

  const content = readFileSync(fullPath, 'utf-8');

  console.log('====================================================');
  console.log(`📄 Analyzing Fixture: ${argPath}`);
  console.log('====================================================');
  console.log(content.trim());
  console.log('----------------------------------------------------\n');

  try {
    const analyzer = new GeminiOpportunityAnalyzer();
    const result = await analyzer.analyze(content);

    console.log('====================================================');
    console.log('🤖 EXTRACTION RESULT');
    console.log('====================================================');
    console.log(`Is Opportunity:       ${result.isOpportunity ? '✅ Yes' : '❌ No'}`);
    console.log(`Confidence Score:     ${result.confidence}`);
    console.log(`Reasoning:            ${result.reasoningSummary || 'N/A'}`);
    console.log(`Model Used:           ${result.modelName || 'N/A'}`);
    console.log(`Analyzer Version:     ${result.analyzerVersion || 'N/A'}`);

    if (result.opportunities.length > 0) {
      const opp = result.opportunities[0];
      console.log('\n--- Extracted Opportunity Details ---');
      console.log(`Title:                ${opp.title}`);
      console.log(`Company:              ${opp.company || 'N/A'}`);
      console.log(`Category:             ${opp.category}`);
      console.log(`Type:                 ${opp.opportunity_type}`);
      console.log(`Location:             ${opp.location || 'N/A'}`);
      console.log(`Work Mode:            ${opp.work_mode || 'N/A'}`);
      console.log(`Stipend:              ${opp.stipend || 'N/A'}`);
      console.log(`Salary:               ${opp.salary || 'N/A'}`);
      console.log(`Eligibility:          ${opp.eligibility || 'N/A'}`);
      console.log(`Graduation Year:      ${opp.graduation_year || 'N/A'}`);
      console.log(`Experience:           ${opp.experience || 'N/A'}`);
      console.log(`Deadline:             ${opp.deadline ? opp.deadline.toISOString() : 'N/A'}`);
      console.log(`Apply URL:            ${opp.apply_url || 'N/A'}`);
      console.log(`Source URL:           ${opp.source_url || 'N/A'}`);
      console.log(`Fingerprint (SHA-256): ${opp.opportunity_fingerprint || 'N/A'}`);
    } else {
      console.log('\nℹ️ No opportunities extracted (message classified as non-opportunity).');
    }

    console.log('====================================================\n');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    logger.error('CLI analysis failed', { error: errorMsg });
    process.exit(1);
  }
}

run();
