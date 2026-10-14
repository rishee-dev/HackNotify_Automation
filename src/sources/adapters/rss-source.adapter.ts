/**
 * RSS Source Adapter for HackNotify Autopilot.
 *
 * Implements the OpportunitySource interface for RSS 2.0 and Atom feeds.
 * Responsible ONLY for fetching and normalizing raw RSS feed items into RawSourceMessage.
 *
 * CRITICAL PIPELINE BOUNDARIES:
 *  - Never calls Gemini AI.
 *  - Never writes to Supabase or any database.
 *  - Never publishes to channels.
 */

import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { SourcePlatform } from '../../domain/enums.js';
import type {
  OpportunitySource,
  RawSourceMessage,
  SourceFetchOptions,
  SourceFetchResult,
} from '../../domain/interfaces.js';
import { withSourceRetry } from '../utils/retry.js';
import { logger } from '../../config/logger.js';

export const DEFAULT_RSS_FEED_URL =
  'https://weworkremotely.com/categories/remote-programming-jobs.rss';
export const DEFAULT_RSS_IDENTIFIER = 'weworkremotely_programming';
export const DEFAULT_RSS_TIMEOUT_MS = 10000;
export const DEFAULT_RSS_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_RSS_PAGE_LIMIT = 50;
export const DEFAULT_USER_AGENT = 'HackNotify-Autopilot/0.1.0 (+https://hacknotify.in)';

export interface RssSourceAdapterOptions {
  identifier?: string;
  feedUrl?: string;
  timeoutMs?: number;
  maxSizeBytes?: number;
  allowPrivateNetworks?: boolean;
  userAgent?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

/**
 * Validates a feed URL for security and protocol compliance.
 * Blocks non-HTTP/HTTPS schemes and private/local network addresses (SSRF prevention).
 */
export function validateFeedUrl(urlStr: string, allowPrivate = false): URL {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('Feed URL must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid feed URL format: "${urlStr}"`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported URL scheme "${parsed.protocol}". Only HTTP and HTTPS are supported.`,
    );
  }

  if (!allowPrivate) {
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error(
        `Access to local or private network host "${hostname}" is blocked for security.`,
      );
    }
  }

  return parsed;
}

/**
 * Decodes common XML/HTML entities into plain characters.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&bull;/g, '•')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

/**
 * Safely converts an HTML string into readable, inert plain text.
 * Strips scripts, styles, and dangerous markup while preserving text formatting and links.
 */
export function htmlToPlainText(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let text = html;

  // 1. Remove script and style tags completely along with their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. Convert line breaks and structural block elements to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|tr|blockquote)>/gi, '\n\n');
  text = text.replace(/<li[^>]*>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');

  // 3. Format anchor links as "Text (URL)" if text is distinct from href
  text = text.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
    (_, href, innerText) => {
      const cleanInnerText = innerText.replace(/<[^>]+>/g, '').trim();
      const cleanHref = href.trim();
      if (!cleanInnerText) return cleanHref;
      if (cleanInnerText === cleanHref || cleanHref.startsWith('#')) return cleanInnerText;
      return `${cleanInnerText} (${cleanHref})`;
    },
  );

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // 5. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 6. Normalize whitespace and newlines
  const lines = text.split('\n').map((l) => l.trimEnd());
  const cleanLines: string[] = [];
  let consecutiveEmpty = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      consecutiveEmpty++;
      if (consecutiveEmpty <= 2 && cleanLines.length > 0) {
        cleanLines.push('');
      }
    } else {
      consecutiveEmpty = 0;
      cleanLines.push(line);
    }
  }

  return cleanLines.join('\n').trim();
}

/**
 * Extracts raw string content from an XML node (handles CDATA, text nodes, and strings).
 */
function extractNodeText(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if ('#text' in obj && obj['#text'] !== undefined) {
      return String(obj['#text'] ?? '').trim();
    }
    if ('__cdata' in obj && obj['__cdata'] !== undefined) {
      return String(obj['__cdata'] ?? '').trim();
    }
  }
  return '';
}

/**
 * Extracts a link URL from an RSS/Atom item link element.
 */
function extractItemLink(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['@_href'] && typeof obj['@_href'] === 'string') {
      return obj['@_href'].trim() || null;
    }
    if (obj['#text'] && typeof obj['#text'] === 'string') {
      return obj['#text'].trim() || null;
    }
    if (obj['href'] && typeof obj['href'] === 'string') {
      return obj['href'].trim() || null;
    }
  }
  return null;
}

/**
 * Extracts media/enclosure URLs from an item.
 */
function extractMediaUrl(item: Record<string, unknown>): string | null {
  const media = item['media:content'];
  if (media && typeof media === 'object') {
    const m = Array.isArray(media) ? media[0] : media;
    if (m && typeof m === 'object' && '@_url' in m) {
      const url = String(m['@_url']).trim();
      if (url) return url;
    }
  }

  const enclosure = item['enclosure'];
  if (enclosure && typeof enclosure === 'object') {
    const enc = Array.isArray(enclosure) ? enclosure[0] : enclosure;
    if (enc && typeof enc === 'object' && '@_url' in enc) {
      const url = String(enc['@_url']).trim();
      if (url) return url;
    }
  }

  return null;
}

/**
 * Extracts category list from an item.
 */
function extractCategories(item: Record<string, unknown>): string[] {
  const cat = item['category'];
  if (!cat) return [];
  if (Array.isArray(cat)) {
    return cat.map(extractNodeText).filter(Boolean);
  }
  const single = extractNodeText(cat);
  return single ? [single] : [];
}

/**
 * Safely parses a publication date string into a Date object.
 * Returns null for missing or invalid dates without throwing.
 */
export function parsePubDate(pubDateStr: string | null | undefined): Date | null {
  if (!pubDateStr || typeof pubDateStr !== 'string' || !pubDateStr.trim()) {
    return null;
  }
  const parsed = new Date(pubDateStr.trim());
  if (isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

/**
 * Generates a deterministic external message ID when RSS `<guid>` is missing.
 * Never uses random numbers or random UUIDs.
 */
export function generateDeterministicRssId(item: {
  guid?: string | null;
  link?: string | null;
  title?: string | null;
  pubDate?: string | null;
  descriptionSnippet?: string | null;
}): string {
  if (item.guid && item.guid.trim()) {
    return item.guid.trim();
  }
  if (item.link && item.link.trim()) {
    return item.link.trim();
  }

  const payload = [
    item.title ?? '',
    item.pubDate ?? '',
    (item.descriptionSnippet ?? '').slice(0, 100),
  ].join('|');

  const hash = createHash('sha256').update(payload, 'utf-8').digest('hex').slice(0, 32);
  return `rss-item-${hash}`;
}

export class RssSourceAdapter implements OpportunitySource {
  readonly platform: SourcePlatform = 'rss';
  readonly identifier: string;
  readonly feedUrl: string;
  private readonly timeoutMs: number;
  private readonly maxSizeBytes: number;
  private readonly allowPrivateNetworks: boolean;
  private readonly userAgent: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly xmlParser: XMLParser;

  constructor(options: RssSourceAdapterOptions = {}) {
    this.identifier = options.identifier ?? DEFAULT_RSS_IDENTIFIER;
    this.feedUrl = options.feedUrl ?? DEFAULT_RSS_FEED_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RSS_TIMEOUT_MS;
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_RSS_MAX_BYTES;
    this.allowPrivateNetworks = options.allowPrivateNetworks ?? false;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 2;

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      trimValues: true,
      parseTagValue: false,
      parseAttributeValue: false,
    });
  }

  /**
   * Fetches RSS feed content over HTTP/HTTPS with size bounding and timeout.
   */
  private async fetchFeedXml(): Promise<string> {
    validateFeedUrl(this.feedUrl, this.allowPrivateNetworks);

    return withSourceRetry(
      async () => {
        let response: Response;

        try {
          response = await this.fetchFn(this.feedUrl, {
            method: 'GET',
            headers: {
              'User-Agent': this.userAgent,
              Accept:
                'application/rss+xml, application/xml, text/xml, application/atom+xml, text/plain, */*',
            },
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (err: unknown) {
          const isTimeout =
            err instanceof Error &&
            (err.name === 'TimeoutError' ||
              err.name === 'AbortError' ||
              err.message.includes('timeout'));

          if (isTimeout) {
            throw new Error(`Feed fetch timed out after ${this.timeoutMs}ms: ${this.feedUrl}`);
          }
          throw err;
        }

        if (!response.ok) {
          const status = response.status;
          if (status === 401 || status === 403) {
            throw new Error(
              `HTTP ${status}: Unauthorized / Forbidden access to feed ${this.feedUrl}`,
            );
          }
          if (status === 404) {
            throw new Error(`HTTP 404: RSS feed not found at ${this.feedUrl}`);
          }
          if (status === 429) {
            throw new Error(`HTTP 429: Rate limited by feed server ${this.feedUrl}`);
          }
          if (status >= 500) {
            throw new Error(`HTTP ${status}: Feed server error at ${this.feedUrl}`);
          }
          throw new Error(`HTTP ${status}: Failed to fetch RSS feed from ${this.feedUrl}`);
        }

        // Bounded response body reading
        if (!response.body) {
          return await response.text();
        }

        const reader = response.body.getReader();
        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            receivedBytes += value.length;
            if (receivedBytes > this.maxSizeBytes) {
              await reader.cancel();
              throw new Error(
                `Response size exceeded maximum allowed limit of ${this.maxSizeBytes} bytes`,
              );
            }
            chunks.push(value);
          }
        }

        const totalBuffer = Buffer.concat(chunks);
        return totalBuffer.toString('utf-8');
      },
      {
        maxRetries: this.maxRetries,
        operationName: `rss_fetch_${this.identifier}`,
      },
    );
  }

  /**
   * Fetches, parses, and normalizes RSS items into RawSourceMessage objects.
   */
  async fetchNewMessages(options: SourceFetchOptions = {}): Promise<SourceFetchResult> {
    const xmlContent = await this.fetchFeedXml();

    if (!xmlContent || !xmlContent.trim()) {
      throw new Error(`Empty RSS feed response from ${this.feedUrl}`);
    }

    let parsedXml: Record<string, unknown>;
    try {
      parsedXml = this.xmlParser.parse(xmlContent) as Record<string, unknown>;
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new Error(`Malformed RSS XML from ${this.feedUrl}: ${msg}`);
    }

    if (!parsedXml || typeof parsedXml !== 'object') {
      throw new Error(`Invalid RSS XML structure from ${this.feedUrl}`);
    }

    // Extract channel & items (handles RSS 2.0 and Atom feeds)
    let rawItems: unknown[] = [];
    let feedTitle = '';

    if (parsedXml.rss && typeof parsedXml.rss === 'object') {
      const channel = (parsedXml.rss as Record<string, unknown>).channel;
      if (!channel || typeof channel !== 'object') {
        throw new Error(`Malformed RSS feed: missing <channel> element at ${this.feedUrl}`);
      }
      feedTitle = extractNodeText((channel as Record<string, unknown>).title);
      const items = (channel as Record<string, unknown>).item;
      if (items) {
        rawItems = Array.isArray(items) ? items : [items];
      }
    } else if (parsedXml.feed && typeof parsedXml.feed === 'object') {
      // Atom feed support
      const feed = parsedXml.feed as Record<string, unknown>;
      feedTitle = extractNodeText(feed.title);
      const entries = feed.entry;
      if (entries) {
        rawItems = Array.isArray(entries) ? entries : [entries];
      }
    } else {
      throw new Error(
        `Unsupported feed format at ${this.feedUrl}: expected <rss><channel> or <feed>`,
      );
    }

    // Convert raw XML items to normalized RawSourceMessage objects
    const allMessages: RawSourceMessage[] = [];

    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object') continue;

      const item = rawItem as Record<string, unknown>;
      const title = extractNodeText(item.title);
      const descriptionRaw =
        extractNodeText(item.description) ||
        extractNodeText(item['content:encoded']) ||
        extractNodeText(item.content) ||
        extractNodeText(item.summary);

      const cleanedDescription = htmlToPlainText(descriptionRaw);

      // Build rawText by combining title and cleaned description
      const textParts: string[] = [];
      if (title) textParts.push(title);
      if (cleanedDescription) textParts.push(cleanedDescription);
      const rawText = textParts.join('\n\n').trim();

      // If item has completely empty content, skip
      if (!rawText) continue;

      const link = extractItemLink(item.link);
      const guidRaw = extractNodeText(item.guid) || extractNodeText(item.id);
      const pubDateRaw =
        extractNodeText(item.pubDate) ||
        extractNodeText(item.pubdate) ||
        extractNodeText(item['dc:date']) ||
        extractNodeText(item.published) ||
        extractNodeText(item.updated);

      const messageTimestamp = parsePubDate(pubDateRaw);
      const mediaUrl = extractMediaUrl(item);
      const categories = extractCategories(item);
      const region = extractNodeText(item.region);
      const author = extractNodeText(item.author) || extractNodeText(item['dc:creator']);

      const externalMessageId = generateDeterministicRssId({
        guid: guidRaw || null,
        link: link || null,
        title: title || null,
        pubDate: pubDateRaw || null,
        descriptionSnippet: cleanedDescription.slice(0, 100),
      });

      const message: RawSourceMessage = {
        externalMessageId,
        rawText,
        sourceUrl: link || null,
        mediaUrl: mediaUrl || null,
        messageTimestamp,
        metadata: {
          feedUrl: this.feedUrl,
          feedTitle: feedTitle || null,
          categories: categories.length > 0 ? categories : undefined,
          region: region || undefined,
          author: author || undefined,
          rawPubDate: pubDateRaw || undefined,
        },
      };

      allMessages.push(message);
    }

    // ─── Filter by `since` Checkpoint ──────────────────────────────────────────
    // If since is specified:
    //  - Include messages where messageTimestamp > since
    //  - Exclude messages where messageTimestamp <= since
    //  - Messages without timestamps cannot be verified as newer and are excluded
    let filteredMessages = [...allMessages];

    if (options.since) {
      const sinceTime = options.since.getTime();
      filteredMessages = filteredMessages.filter((msg) => {
        if (!msg.messageTimestamp) return false;
        return msg.messageTimestamp.getTime() > sinceTime;
      });
    }

    // ─── Apply Cursor Pagination ───────────────────────────────────────────────
    // If cursor is specified, slice from the item immediately following the cursor
    if (options.cursor) {
      const cursorIndex = filteredMessages.findIndex((m) => m.externalMessageId === options.cursor);
      if (cursorIndex !== -1) {
        filteredMessages = filteredMessages.slice(cursorIndex + 1);
      }
    }

    // ─── Apply Limit & Determine hasMore / nextCursor ──────────────────────────
    const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_RSS_PAGE_LIMIT;
    const pageMessages = filteredMessages.slice(0, limit);
    const hasMore = filteredMessages.length > limit;
    const nextCursor =
      hasMore && pageMessages.length > 0
        ? (pageMessages[pageMessages.length - 1].externalMessageId ?? null)
        : null;

    logger.debug('RSS feed fetched and normalized', {
      identifier: this.identifier,
      totalItemsInFeed: allMessages.length,
      returnedCount: pageMessages.length,
      hasMore,
    });

    return {
      messages: pageMessages,
      nextCursor,
      hasMore,
      metadata: {
        feedUrl: this.feedUrl,
        feedTitle,
        totalItemsInFeed: allMessages.length,
        filteredCount: filteredMessages.length,
        returnedCount: pageMessages.length,
      },
    };
  }
}
