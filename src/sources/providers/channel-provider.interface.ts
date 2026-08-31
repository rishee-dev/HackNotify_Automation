/**
 * Channel Provider Interfaces for External Messaging Platforms.
 *
 * This abstraction decouples source adapters from specific transport/API providers.
 *
 * ============================================================================
 * CRITICAL ARCHITECTURAL POLICY: AUTHORIZED PROVIDERS ONLY
 * ============================================================================
 * HackNotify Autopilot STRICTLY prohibits:
 *  - Unofficial WhatsApp Web scraping / puppeteer / browser automation
 *  - QR code session hacking / hijacking
 *  - Reverse-engineered private APIs or stolen session tokens
 *
 * All future messaging integrations MUST use official, authorized APIs:
 *  - Meta WhatsApp Business Cloud API / On-Premises API
 *  - Authorized BSPs (Twilio, MessageBird, Gupshup, etc.)
 *  - Telegram Bot API
 * ============================================================================
 */

import type { SourceFetchOptions, SourceFetchResult } from '../../domain/interfaces.js';

export interface ChannelProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  rateLimitPerMinute?: number;
}

/**
 * Common contract for external messaging channel providers.
 */
export interface ChannelProvider {
  readonly providerName: string;
  fetchChannelMessages(channelId: string, options?: SourceFetchOptions): Promise<SourceFetchResult>;
}

/**
 * Future WhatsApp Cloud API Provider contract.
 * Stubbed for future Phase 4+ implementation once official Meta API credentials are configured.
 */
export interface WhatsAppChannelProvider extends ChannelProvider {
  readonly providerName: 'whatsapp_cloud_api' | 'whatsapp_bsp';
}

/**
 * Future Telegram Bot API Provider contract.
 */
export interface TelegramChannelProvider extends ChannelProvider {
  readonly providerName: 'telegram_bot_api';
}
