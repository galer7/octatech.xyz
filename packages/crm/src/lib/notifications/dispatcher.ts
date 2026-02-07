/**
 * Notification Dispatcher.
 *
 * Central orchestrator for sending notifications to configured channels.
 * Implements async, non-blocking delivery per specs/09-notifications.md.
 *
 * Features:
 * - Query enabled channels for event type
 * - Dispatch to each channel asynchronously
 * - Handle failures gracefully (don't block main operation)
 * - Log results for debugging
 */

import { eq } from "drizzle-orm";
import { db, notificationChannels, type Lead } from "../../db/index.js";
import type {
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationChannelInfo,
  NotificationChannelType,
  NotificationConfig,
  NotificationLeadData,
} from "./types.js";
import { leadToNotificationData, VALID_NOTIFICATION_EVENTS } from "./types.js";
import { discordProvider } from "./discord.js";
import { telegramProvider } from "./telegram.js";
import { emailProvider } from "./email.js";

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

/**
 * Map of channel types to their providers.
 */
const providers = {
  discord: discordProvider,
  telegram: telegramProvider,
  email: emailProvider,
} as const;

// ============================================================================
// CHANNEL QUERYING
// ============================================================================

/**
 * Get all enabled notification channels subscribed to a specific event.
 *
 * @param event - The event type to filter by
 * @returns Array of enabled channels subscribed to the event
 *
 * @example
 * ```ts
 * const channels = await getChannelsForEvent("lead.created");
 * // Returns all enabled channels with "lead.created" in their events array
 * ```
 */
export async function getChannelsForEvent(
  event: string
): Promise<NotificationChannelInfo[]> {
  const allChannels = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.enabled, true));

  // Filter to channels that include this event
  return allChannels
    .filter((channel) => channel.events.includes(event))
    .map((channel) => ({
      id: channel.id,
      type: channel.type as NotificationChannelType,
      name: channel.name,
      config: channel.config as NotificationConfig,
      events: channel.events,
      enabled: channel.enabled,
    }));
}

// ============================================================================
// NOTIFICATION DISPATCH
// ============================================================================

/**
 * Result of dispatching a notification to a single channel.
 */
export interface ChannelDispatchResult extends NotificationDeliveryResult {
  channelId: string;
  channelName: string;
  channelType: NotificationChannelType;
}

/**
 * Send a notification to a specific channel.
 *
 * @param channel - The channel to send to
 * @param payload - The notification payload
 * @returns Delivery result with channel info
 */
async function sendToChannel(
  channel: NotificationChannelInfo,
  payload: NotificationPayload
): Promise<ChannelDispatchResult> {
  const provider = providers[channel.type];

  if (!provider) {
    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      success: false,
      error: `Unknown channel type: ${channel.type}`,
      durationMs: 0,
    };
  }

  try {
    const result = await provider.send(channel.config, payload);
    return {
      ...result,
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
    };
  } catch (error) {
    return {
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: 0,
    };
  }
}

/**
 * Dispatch a notification event to all subscribed channels.
 *
 * This is the main entry point for triggering notifications. It:
 * 1. Finds all enabled channels subscribed to the event
 * 2. Sends the notification to each channel in parallel
 * 3. Returns results for all channels
 *
 * @param event - The event type
 * @param payload - The notification payload
 * @returns Array of dispatch results for each channel
 *
 * @example
 * ```ts
 * const results = await dispatchNotification("lead.created", {
 *   event: "lead.created",
 *   lead: leadData,
 * });
 *
 * for (const result of results) {
 *   if (!result.success) {
 *     console.error(`Notification to ${result.channelName} failed: ${result.error}`);
 *   }
 * }
 * ```
 */
export async function dispatchNotification(
  event: string,
  payload: NotificationPayload
): Promise<ChannelDispatchResult[]> {
  // Validate event type
  if (!VALID_NOTIFICATION_EVENTS.has(event)) {
    console.warn(`Unknown notification event: ${event}`);
    return [];
  }

  // Get channels for this event
  const channels = await getChannelsForEvent(event);

  if (channels.length === 0) {
    return [];
  }

  // Dispatch to all channels in parallel
  const results = await Promise.all(
    channels.map((channel) => sendToChannel(channel, payload))
  );

  // Log results for debugging
  for (const result of results) {
    if (result.success) {
      console.log(
        `Notification sent to ${result.channelType} "${result.channelName}" in ${result.durationMs}ms`
      );
    } else {
      console.error(
        `Notification to ${result.channelType} "${result.channelName}" failed: ${result.error}`
      );
    }
  }

  return results;
}

/**
 * Dispatch a notification without waiting for results.
 * Used for fire-and-forget notifications that shouldn't block the main operation.
 *
 * @param event - The event type
 * @param payload - The notification payload
 *
 * @example
 * ```ts
 * // Fire and forget - don't await
 * dispatchNotificationAsync("lead.created", payload);
 * ```
 */
export function dispatchNotificationAsync(
  event: string,
  payload: NotificationPayload
): void {
  dispatchNotification(event, payload).catch((error) => {
    console.error(`Failed to dispatch notification for ${event}:`, error);
  });
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trigger notifications for a lead.created event.
 *
 * This is a fire-and-forget operation that won't block the main operation.
 *
 * @param lead - The created lead
 *
 * @example
 * ```ts
 * // After creating a lead
 * const lead = await createLead(data);
 * triggerLeadCreatedNotification(lead);
 * ```
 */
export function triggerLeadCreatedNotification(lead: Lead): void {
  const payload: NotificationPayload = {
    event: "lead.created",
    lead: leadToNotificationData(lead),
  };

  dispatchNotificationAsync("lead.created", payload);
}

/**
 * Trigger notifications for a lead.status_changed event.
 *
 * This is a fire-and-forget operation that won't block the main operation.
 *
 * @param lead - The lead with updated status
 * @param previousStatus - The previous status value
 * @param newStatus - The new status value
 *
 * @example
 * ```ts
 * // After updating lead status
 * triggerLeadStatusChangedNotification(lead, "new", "contacted");
 * ```
 */
export function triggerLeadStatusChangedNotification(
  lead: Lead,
  previousStatus: string,
  newStatus: string
): void {
  const payload: NotificationPayload = {
    event: "lead.status_changed",
    lead: leadToNotificationData(lead),
    previousStatus,
    newStatus,
  };

  dispatchNotificationAsync("lead.status_changed", payload);
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Send a test notification to a specific channel.
 * Used for verifying channel configuration from the admin UI.
 *
 * @param channelId - The channel ID to test
 * @returns Test result or null if channel not found
 *
 * @example
 * ```ts
 * const result = await sendTestNotification(channelId);
 * if (result?.success) {
 *   console.log("Test notification sent successfully");
 * } else {
 *   console.error("Test failed:", result?.error);
 * }
 * ```
 */
export async function sendTestNotification(
  channelId: string
): Promise<ChannelDispatchResult | null> {
  // Get the channel
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, channelId))
    .limit(1);

  if (!channel) {
    return null;
  }

  // Create test payload
  const testLead: NotificationLeadData = {
    id: "test-lead-00000000-0000-0000-0000-000000000000",
    name: "Test Lead",
    email: "test@example.com",
    company: "Test Company Inc",
    phone: "+1-555-0123",
    budget: "$10,000 - $50,000",
    projectType: "New Product / MVP",
    message:
      "This is a test notification to verify your channel configuration is working correctly.",
    source: "Test",
    status: "new",
    createdAt: new Date(),
  };

  const testPayload: NotificationPayload = {
    event: "lead.created",
    lead: testLead,
  };

  const channelInfo: NotificationChannelInfo = {
    id: channel.id,
    type: channel.type as NotificationChannelType,
    name: channel.name,
    config: channel.config as NotificationConfig,
    events: channel.events,
    enabled: channel.enabled,
  };

  return sendToChannel(channelInfo, testPayload);
}

/**
 * Validate a channel's configuration without sending a notification.
 *
 * @param type - The channel type
 * @param config - The configuration to validate
 * @returns Validation result
 */
export function validateChannelConfig(
  type: NotificationChannelType,
  config: unknown
): { valid: boolean; error?: string } {
  const provider = providers[type];

  if (!provider) {
    return { valid: false, error: `Unknown channel type: ${type}` };
  }

  return provider.validateConfig(config);
}
