/**
 * Type definitions for the notification system.
 *
 * Defines shared types used across all notification providers
 * and the dispatcher per specs/09-notifications.md.
 */

import type { Lead } from "../../db";

// ============================================================================
// CHANNEL TYPES
// ============================================================================

/**
 * Supported notification channel types.
 */
export type NotificationChannelType = "discord" | "telegram" | "email";

/**
 * Configuration for Discord notifications via webhook.
 */
export interface DiscordConfig {
  webhook_url: string;
}

/**
 * Configuration for Telegram notifications via bot API.
 */
export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

/**
 * Configuration for Email notifications via Resend.
 */
export interface EmailConfig {
  to: string;
  from: string;
}

/**
 * Union type for all channel configurations.
 */
export type NotificationConfig = DiscordConfig | TelegramConfig | EmailConfig;

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Supported notification event types.
 * Currently supports lead.created and lead.status_changed.
 */
export const notificationEventEnum = [
  "lead.created",
  "lead.status_changed",
] as const;

export type NotificationEvent = (typeof notificationEventEnum)[number];

/**
 * Valid notification events as a Set for fast lookup.
 */
export const VALID_NOTIFICATION_EVENTS = new Set<string>(notificationEventEnum);

// ============================================================================
// NOTIFICATION DATA
// ============================================================================

/**
 * Lead data used in notifications.
 * Contains the essential fields for notification content.
 */
export interface NotificationLeadData {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  budget: string | null;
  projectType: string | null;
  message: string;
  source: string | null;
  status: string;
  createdAt: Date;
}

/**
 * Payload for lead.created notifications.
 */
export interface LeadCreatedNotification {
  event: "lead.created";
  lead: NotificationLeadData;
}

/**
 * Payload for lead.status_changed notifications.
 */
export interface LeadStatusChangedNotification {
  event: "lead.status_changed";
  lead: NotificationLeadData;
  previousStatus: string;
  newStatus: string;
}

/**
 * Union type for all notification payloads.
 */
export type NotificationPayload =
  | LeadCreatedNotification
  | LeadStatusChangedNotification;

// ============================================================================
// DELIVERY TYPES
// ============================================================================

/**
 * Result of a notification delivery attempt.
 */
export interface NotificationDeliveryResult {
  /** Whether the delivery was successful */
  success: boolean;
  /** Error message if delivery failed */
  error?: string;
  /** HTTP status code from the API (if applicable) */
  statusCode?: number;
  /** Time taken to deliver in milliseconds */
  durationMs: number;
}

/**
 * Channel information for dispatching.
 */
export interface NotificationChannelInfo {
  id: string;
  type: NotificationChannelType;
  name: string;
  config: NotificationConfig;
  events: string[];
  enabled: boolean;
}

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

/**
 * Interface that all notification providers must implement.
 */
export interface NotificationProvider {
  /**
   * Send a notification via this channel.
   *
   * @param config - Channel-specific configuration
   * @param payload - The notification payload
   * @returns Delivery result
   */
  send(
    config: NotificationConfig,
    payload: NotificationPayload
  ): Promise<NotificationDeliveryResult>;

  /**
   * Validate channel configuration.
   *
   * @param config - Configuration to validate
   * @returns Object with valid flag and optional error
   */
  validateConfig(config: unknown): { valid: boolean; error?: string };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a Lead database object to NotificationLeadData.
 *
 * @param lead - The lead from the database
 * @returns Formatted lead data for notifications
 */
export function leadToNotificationData(lead: Lead): NotificationLeadData {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    phone: lead.phone,
    budget: lead.budget,
    projectType: lead.projectType,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    createdAt: lead.createdAt,
  };
}

/**
 * Get the CRM base URL for generating links to leads.
 * Defaults to environment variable or localhost for development.
 */
export function getCrmBaseUrl(): string {
  return process.env.CRM_BASE_URL || "https://api.octatech.xyz";
}

/**
 * Generate a link to view a lead in the CRM admin UI.
 *
 * @param leadId - The lead ID
 * @returns Full URL to the lead detail page
 */
export function getLeadUrl(leadId: string): string {
  return `${getCrmBaseUrl()}/leads/${leadId}`;
}

/**
 * Type guard to check if config is DiscordConfig.
 */
export function isDiscordConfig(config: NotificationConfig): config is DiscordConfig {
  return "webhook_url" in config;
}

/**
 * Type guard to check if config is TelegramConfig.
 */
export function isTelegramConfig(config: NotificationConfig): config is TelegramConfig {
  return "bot_token" in config && "chat_id" in config;
}

/**
 * Type guard to check if config is EmailConfig.
 */
export function isEmailConfig(config: NotificationConfig): config is EmailConfig {
  return "to" in config && "from" in config;
}
