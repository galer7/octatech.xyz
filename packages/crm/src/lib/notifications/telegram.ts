/**
 * Telegram Notification Provider.
 *
 * Implements Telegram Bot API notifications with HTML formatting
 * per specs/09-notifications.md.
 *
 * Features:
 * - HTML formatted messages with bold, italic, links
 * - Configurable bot token and chat ID
 * - Timeout handling (10 second default)
 * - Graceful error handling
 */

import type {
  TelegramConfig,
  NotificationConfig,
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationProvider,
} from "./types";
import { isTelegramConfig, getLeadUrl } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Telegram notification configuration.
 */
export const TELEGRAM_CONFIG = {
  /** HTTP request timeout in milliseconds */
  timeoutMs: 10_000,
  /** Telegram Bot API base URL */
  apiBaseUrl: "https://api.telegram.org",
} as const;

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Escape HTML special characters for Telegram HTML mode.
 *
 * @param text - Text to escape
 * @returns Escaped text safe for HTML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format a lead.created notification as Telegram HTML message.
 *
 * @param payload - The notification payload
 * @returns HTML formatted message string
 *
 * @example
 * ```ts
 * const message = formatLeadCreatedMessage(payload);
 * // Returns:
 * // <b>🆕 New Lead: John Doe</b>
 * //
 * // <b>Email:</b> john@acme.com
 * // ...
 * ```
 */
export function formatLeadCreatedMessage(
  payload: Extract<NotificationPayload, { event: "lead.created" }>
): string {
  const { lead } = payload;
  const lines: string[] = [];

  // Title
  lines.push(`<b>🆕 New Lead: ${escapeHtml(lead.name)}</b>`);
  lines.push("");

  // Contact info
  lines.push(`<b>Email:</b> ${escapeHtml(lead.email)}`);

  if (lead.company) {
    lines.push(`<b>Company:</b> ${escapeHtml(lead.company)}`);
  }

  if (lead.phone) {
    lines.push(`<b>Phone:</b> ${escapeHtml(lead.phone)}`);
  }

  if (lead.budget) {
    lines.push(`<b>Budget:</b> ${escapeHtml(lead.budget)}`);
  }

  if (lead.projectType) {
    lines.push(`<b>Project:</b> ${escapeHtml(lead.projectType)}`);
  }

  if (lead.source) {
    lines.push(`<b>Source:</b> ${escapeHtml(lead.source)}`);
  }

  // Message (truncate if too long)
  lines.push("");
  const maxMessageLength = 500;
  const truncatedMessage =
    lead.message.length > maxMessageLength
      ? lead.message.substring(0, maxMessageLength) + "..."
      : lead.message;
  lines.push(`<i>${escapeHtml(truncatedMessage)}</i>`);

  // CRM link
  lines.push("");
  lines.push(`<a href="${getLeadUrl(lead.id)}">View in CRM →</a>`);

  return lines.join("\n");
}

/**
 * Format a lead.status_changed notification as Telegram HTML message.
 *
 * @param payload - The notification payload
 * @returns HTML formatted message string
 */
export function formatLeadStatusChangedMessage(
  payload: Extract<NotificationPayload, { event: "lead.status_changed" }>
): string {
  const { lead, previousStatus, newStatus } = payload;
  const lines: string[] = [];

  // Title
  lines.push(`<b>📊 Status Changed: ${escapeHtml(lead.name)}</b>`);
  lines.push("");

  // Status change info
  lines.push(`<b>Email:</b> ${escapeHtml(lead.email)}`);

  if (lead.company) {
    lines.push(`<b>Company:</b> ${escapeHtml(lead.company)}`);
  }

  lines.push("");
  lines.push(
    `<b>Status:</b> ${escapeHtml(previousStatus)} → ${escapeHtml(newStatus)}`
  );

  // CRM link
  lines.push("");
  lines.push(`<a href="${getLeadUrl(lead.id)}">View in CRM →</a>`);

  return lines.join("\n");
}

/**
 * Format a notification payload as Telegram HTML message.
 *
 * @param payload - The notification payload
 * @returns HTML formatted message string
 */
export function formatTelegramMessage(payload: NotificationPayload): string {
  if (payload.event === "lead.created") {
    return formatLeadCreatedMessage(payload);
  } else {
    return formatLeadStatusChangedMessage(payload);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Telegram configuration.
 *
 * @param config - Configuration to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```ts
 * const result = validateTelegramConfig({
 *   bot_token: "123456:ABC-DEF...",
 *   chat_id: "-1001234567890"
 * });
 * ```
 */
export function validateTelegramConfig(config: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "Configuration is required" };
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.bot_token || typeof cfg.bot_token !== "string") {
    return { valid: false, error: "bot_token is required and must be a string" };
  }

  // Bot token format: {bot_id}:{token}
  const botTokenRegex = /^\d+:[\w-]+$/;
  if (!botTokenRegex.test(cfg.bot_token)) {
    return {
      valid: false,
      error: "Invalid bot_token format. Expected format: {bot_id}:{token}",
    };
  }

  if (!cfg.chat_id || typeof cfg.chat_id !== "string") {
    return { valid: false, error: "chat_id is required and must be a string" };
  }

  // Chat ID should be numeric (can be negative for groups)
  const chatIdRegex = /^-?\d+$/;
  if (!chatIdRegex.test(cfg.chat_id)) {
    return {
      valid: false,
      error: "Invalid chat_id format. Must be a numeric string (can be negative for groups)",
    };
  }

  return { valid: true };
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Telegram sendMessage API response.
 */
interface TelegramApiResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  result?: {
    message_id: number;
  };
}

/**
 * Send a notification to Telegram via Bot API.
 *
 * @param config - Telegram configuration with bot token and chat ID
 * @param payload - The notification payload
 * @returns Delivery result
 *
 * @example
 * ```ts
 * const result = await sendTelegramNotification(
 *   { bot_token: "123:ABC", chat_id: "-100123" },
 *   { event: "lead.created", lead: { ... } }
 * );
 *
 * if (!result.success) {
 *   console.error("Telegram notification failed:", result.error);
 * }
 * ```
 */
export async function sendTelegramNotification(
  config: TelegramConfig,
  payload: NotificationPayload
): Promise<NotificationDeliveryResult> {
  const startTime = Date.now();

  // Validate configuration
  const validation = validateTelegramConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      durationMs: Date.now() - startTime,
    };
  }

  // Format the message
  const message = formatTelegramMessage(payload);

  // Build API URL
  const apiUrl = `${TELEGRAM_CONFIG.apiBaseUrl}/bot${config.bot_token}/sendMessage`;

  // Build request body
  const body = JSON.stringify({
    chat_id: config.chat_id,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TELEGRAM_CONFIG.timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // Parse response
    let apiResponse: TelegramApiResponse;
    try {
      apiResponse = (await response.json()) as TelegramApiResponse;
    } catch {
      return {
        success: false,
        error: `Invalid JSON response from Telegram API`,
        statusCode: response.status,
        durationMs,
      };
    }

    if (apiResponse.ok) {
      return {
        success: true,
        statusCode: response.status,
        durationMs,
      };
    }

    // Handle specific Telegram API errors
    if (apiResponse.error_code === 429) {
      return {
        success: false,
        error: `Telegram rate limited: ${apiResponse.description}`,
        statusCode: response.status,
        durationMs,
      };
    }

    return {
      success: false,
      error: `Telegram API error: ${apiResponse.description || "Unknown error"}`,
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
          error: `Request timeout after ${TELEGRAM_CONFIG.timeoutMs}ms`,
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
 * Telegram notification provider implementation.
 */
export const telegramProvider: NotificationProvider = {
  async send(
    config: NotificationConfig,
    payload: NotificationPayload
  ): Promise<NotificationDeliveryResult> {
    if (!isTelegramConfig(config)) {
      return {
        success: false,
        error: "Invalid Telegram configuration",
        durationMs: 0,
      };
    }
    return sendTelegramNotification(config, payload);
  },

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    return validateTelegramConfig(config);
  },
};
