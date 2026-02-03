/**
 * Discord Notification Provider.
 *
 * Implements Discord webhook notifications with rich embed formatting
 * per specs/09-notifications.md.
 *
 * Features:
 * - Rich embed formatting with fields for lead details
 * - Configurable webhook URL
 * - Timeout handling (10 second default)
 * - Graceful error handling
 */

import type {
  DiscordConfig,
  NotificationConfig,
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationProvider,
} from "./types";
import { isDiscordConfig, getLeadUrl } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Discord notification configuration.
 */
export const DISCORD_CONFIG = {
  /** HTTP request timeout in milliseconds */
  timeoutMs: 10_000,
  /** Indigo color for embed accent (6366f1 in decimal) */
  embedColor: 6513393,
} as const;

/**
 * Discord webhook URL pattern for validation.
 */
const DISCORD_WEBHOOK_REGEX =
  /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

// ============================================================================
// EMBED FORMATTING
// ============================================================================

/**
 * Discord embed field type.
 */
interface DiscordEmbedField {
  name: string;
  value: string;
  inline: boolean;
}

/**
 * Discord embed structure.
 */
interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: DiscordEmbedField[];
  timestamp: string;
  footer: { text: string };
  url?: string;
}

/**
 * Discord webhook payload structure.
 */
interface DiscordWebhookPayload {
  content: null;
  embeds: DiscordEmbed[];
}

/**
 * Format a lead.created notification as a Discord embed.
 *
 * @param payload - The notification payload
 * @returns Discord webhook payload
 *
 * @example
 * ```ts
 * const embed = formatLeadCreatedEmbed(payload);
 * // Returns Discord embed with title "🆕 New Lead: John Doe"
 * ```
 */
export function formatLeadCreatedEmbed(
  payload: Extract<NotificationPayload, { event: "lead.created" }>
): DiscordWebhookPayload {
  const { lead } = payload;
  const fields: DiscordEmbedField[] = [];

  // Add email field (always present)
  fields.push({
    name: "📧 Email",
    value: lead.email,
    inline: true,
  });

  // Add company field if present
  if (lead.company) {
    fields.push({
      name: "🏢 Company",
      value: lead.company,
      inline: true,
    });
  }

  // Add phone field if present
  if (lead.phone) {
    fields.push({
      name: "📞 Phone",
      value: lead.phone,
      inline: true,
    });
  }

  // Add budget field if present
  if (lead.budget) {
    fields.push({
      name: "💰 Budget",
      value: lead.budget,
      inline: true,
    });
  }

  // Add project type field if present
  if (lead.projectType) {
    fields.push({
      name: "📋 Project",
      value: lead.projectType,
      inline: true,
    });
  }

  // Add source field if present
  if (lead.source) {
    fields.push({
      name: "🔗 Source",
      value: lead.source,
      inline: true,
    });
  }

  // Truncate message if too long for embed description
  const maxMessageLength = 1000;
  const truncatedMessage =
    lead.message.length > maxMessageLength
      ? lead.message.substring(0, maxMessageLength) + "..."
      : lead.message;

  return {
    content: null,
    embeds: [
      {
        title: `🆕 New Lead: ${lead.name}`,
        description: truncatedMessage,
        color: DISCORD_CONFIG.embedColor,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "Octatech CRM" },
        url: getLeadUrl(lead.id),
      },
    ],
  };
}

/**
 * Format a lead.status_changed notification as a Discord embed.
 *
 * @param payload - The notification payload
 * @returns Discord webhook payload
 */
export function formatLeadStatusChangedEmbed(
  payload: Extract<NotificationPayload, { event: "lead.status_changed" }>
): DiscordWebhookPayload {
  const { lead, previousStatus, newStatus } = payload;

  const fields: DiscordEmbedField[] = [
    {
      name: "📧 Email",
      value: lead.email,
      inline: true,
    },
    {
      name: "📊 Status Change",
      value: `${previousStatus} → ${newStatus}`,
      inline: true,
    },
  ];

  if (lead.company) {
    fields.push({
      name: "🏢 Company",
      value: lead.company,
      inline: true,
    });
  }

  return {
    content: null,
    embeds: [
      {
        title: `📊 Status Changed: ${lead.name}`,
        color: DISCORD_CONFIG.embedColor,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "Octatech CRM" },
        url: getLeadUrl(lead.id),
      },
    ],
  };
}

/**
 * Format a notification payload as a Discord webhook payload.
 *
 * @param payload - The notification payload
 * @returns Discord webhook payload
 */
export function formatDiscordPayload(
  payload: NotificationPayload
): DiscordWebhookPayload {
  if (payload.event === "lead.created") {
    return formatLeadCreatedEmbed(payload);
  } else {
    return formatLeadStatusChangedEmbed(payload);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Discord configuration.
 *
 * @param config - Configuration to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```ts
 * const result = validateDiscordConfig({ webhook_url: "https://discord.com/api/webhooks/123/abc" });
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateDiscordConfig(config: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "Configuration is required" };
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.webhook_url || typeof cfg.webhook_url !== "string") {
    return { valid: false, error: "webhook_url is required and must be a string" };
  }

  if (!DISCORD_WEBHOOK_REGEX.test(cfg.webhook_url)) {
    return {
      valid: false,
      error:
        "Invalid Discord webhook URL. Must be https://discord.com/api/webhooks/{id}/{token}",
    };
  }

  return { valid: true };
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Send a notification to Discord via webhook.
 *
 * @param config - Discord configuration with webhook URL
 * @param payload - The notification payload
 * @returns Delivery result
 *
 * @example
 * ```ts
 * const result = await sendDiscordNotification(
 *   { webhook_url: "https://discord.com/api/webhooks/..." },
 *   { event: "lead.created", lead: { ... } }
 * );
 *
 * if (!result.success) {
 *   console.error("Discord notification failed:", result.error);
 * }
 * ```
 */
export async function sendDiscordNotification(
  config: DiscordConfig,
  payload: NotificationPayload
): Promise<NotificationDeliveryResult> {
  const startTime = Date.now();

  // Validate configuration
  const validation = validateDiscordConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      durationMs: Date.now() - startTime,
    };
  }

  // Format the payload
  const discordPayload = formatDiscordPayload(payload);
  const body = JSON.stringify(discordPayload);

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DISCORD_CONFIG.timeoutMs);

  try {
    const response = await fetch(config.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    if (response.ok || response.status === 204) {
      return {
        success: true,
        statusCode: response.status,
        durationMs,
      };
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      return {
        success: false,
        error: `Discord rate limited. Retry after ${retryAfter || "unknown"} seconds`,
        statusCode: response.status,
        durationMs,
      };
    }

    // Handle other errors
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // Ignore response read errors
    }

    return {
      success: false,
      error: `Discord webhook returned ${response.status}: ${errorBody.substring(0, 200)}`,
      statusCode: response.status,
      durationMs,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: `Request timeout after ${DISCORD_CONFIG.timeoutMs}ms`,
          durationMs,
        };
      }
      return {
        success: false,
        error: `Network error: ${error.message}`,
        durationMs,
      };
    }

    return {
      success: false,
      error: "Unknown error occurred",
      durationMs,
    };
  }
}

// ============================================================================
// PROVIDER EXPORT
// ============================================================================

/**
 * Discord notification provider implementation.
 */
export const discordProvider: NotificationProvider = {
  async send(
    config: NotificationConfig,
    payload: NotificationPayload
  ): Promise<NotificationDeliveryResult> {
    if (!isDiscordConfig(config)) {
      return {
        success: false,
        error: "Invalid Discord configuration",
        durationMs: 0,
      };
    }
    return sendDiscordNotification(config, payload);
  },

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    return validateDiscordConfig(config);
  },
};
