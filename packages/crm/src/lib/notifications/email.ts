/**
 * Email Notification Provider.
 *
 * Implements email notifications via Resend API with HTML formatting
 * per specs/09-notifications.md.
 *
 * Features:
 * - Rich HTML email templates
 * - Configurable sender and recipient
 * - Timeout handling (10 second default)
 * - Graceful error handling
 */

import type {
  EmailConfig,
  NotificationConfig,
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationProvider,
} from "./types";
import { isEmailConfig, getLeadUrl } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Email notification configuration.
 */
export const EMAIL_CONFIG = {
  /** HTTP request timeout in milliseconds */
  timeoutMs: 10_000,
  /** Resend API base URL */
  apiBaseUrl: "https://api.resend.com",
  /** Default sender email if not configured */
  defaultFrom: "Octatech CRM <crm@octatech.xyz>",
} as const;

/**
 * Email regex pattern for validation.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// HTML FORMATTING
// ============================================================================

/**
 * Escape HTML special characters.
 *
 * @param text - Text to escape
 * @returns Escaped text safe for HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Format a lead.created notification as HTML email.
 *
 * @param payload - The notification payload
 * @returns HTML email content
 */
export function formatLeadCreatedEmail(
  payload: Extract<NotificationPayload, { event: "lead.created" }>
): { subject: string; html: string } {
  const { lead } = payload;

  const subject = lead.company
    ? `New Lead: ${lead.name} - ${lead.company}`
    : `New Lead: ${lead.name}`;

  // Build table rows for lead fields
  const rows: Array<{ label: string; value: string }> = [
    { label: "Name", value: lead.name },
    { label: "Email", value: lead.email },
  ];

  if (lead.company) {
    rows.push({ label: "Company", value: lead.company });
  }

  if (lead.phone) {
    rows.push({ label: "Phone", value: lead.phone });
  }

  if (lead.budget) {
    rows.push({ label: "Budget", value: lead.budget });
  }

  if (lead.projectType) {
    rows.push({ label: "Project Type", value: lead.projectType });
  }

  if (lead.source) {
    rows.push({ label: "Source", value: lead.source });
  }

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(row.label)}</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #6366f1; margin-bottom: 24px;">🆕 New Lead Received</h2>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    ${tableRows}
  </table>

  <h3 style="color: #333; margin-bottom: 12px;">Message</h3>
  <p style="background: #f5f5f5; padding: 16px; border-radius: 8px; white-space: pre-wrap; margin-bottom: 24px;">
${escapeHtml(lead.message)}
  </p>

  <p style="margin-bottom: 24px;">
    <a href="${getLeadUrl(lead.id)}"
       style="display: inline-block; background: #6366f1; color: white;
              padding: 12px 24px; text-decoration: none; border-radius: 8px;
              font-weight: 500;">
      View Lead in CRM
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #666; font-size: 12px;">
    Octatech CRM • <a href="https://octatech.xyz" style="color: #6366f1;">octatech.xyz</a>
  </p>
</body>
</html>
  `.trim();

  return { subject, html };
}

/**
 * Format a lead.status_changed notification as HTML email.
 *
 * @param payload - The notification payload
 * @returns HTML email content
 */
export function formatLeadStatusChangedEmail(
  payload: Extract<NotificationPayload, { event: "lead.status_changed" }>
): { subject: string; html: string } {
  const { lead, previousStatus, newStatus } = payload;

  const subject = lead.company
    ? `Status Changed: ${lead.name} - ${lead.company} (${previousStatus} → ${newStatus})`
    : `Status Changed: ${lead.name} (${previousStatus} → ${newStatus})`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #6366f1; margin-bottom: 24px;">📊 Lead Status Changed</h2>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(lead.name)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(lead.email)}</td>
    </tr>
    ${
      lead.company
        ? `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Company</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(lead.company)}</td>
    </tr>
    `
        : ""
    }
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Previous Status</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(previousStatus)}</td>
    </tr>
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>New Status</strong></td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong style="color: #6366f1;">${escapeHtml(newStatus)}</strong></td>
    </tr>
  </table>

  <p style="margin-bottom: 24px;">
    <a href="${getLeadUrl(lead.id)}"
       style="display: inline-block; background: #6366f1; color: white;
              padding: 12px 24px; text-decoration: none; border-radius: 8px;
              font-weight: 500;">
      View Lead in CRM
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="color: #666; font-size: 12px;">
    Octatech CRM • <a href="https://octatech.xyz" style="color: #6366f1;">octatech.xyz</a>
  </p>
</body>
</html>
  `.trim();

  return { subject, html };
}

/**
 * Format a notification payload as HTML email.
 *
 * @param payload - The notification payload
 * @returns Subject and HTML body
 */
export function formatEmail(payload: NotificationPayload): {
  subject: string;
  html: string;
} {
  if (payload.event === "lead.created") {
    return formatLeadCreatedEmail(payload);
  } else {
    return formatLeadStatusChangedEmail(payload);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate email configuration.
 *
 * @param config - Configuration to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```ts
 * const result = validateEmailConfig({
 *   to: "admin@example.com",
 *   from: "CRM <crm@octatech.xyz>"
 * });
 * ```
 */
export function validateEmailConfig(config: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!config || typeof config !== "object") {
    return { valid: false, error: "Configuration is required" };
  }

  const cfg = config as Record<string, unknown>;

  if (!cfg.to || typeof cfg.to !== "string") {
    return { valid: false, error: "to is required and must be a string" };
  }

  // Validate each email in the "to" field (comma-separated)
  const toEmails = cfg.to.split(",").map((e) => e.trim());
  for (const email of toEmails) {
    // Extract email from "Name <email>" format if present
    const match = email.match(/<([^>]+)>/) || [null, email];
    const cleanEmail = match[1];

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return {
        valid: false,
        error: `Invalid email address in 'to' field: ${email}`,
      };
    }
  }

  if (!cfg.from || typeof cfg.from !== "string") {
    return { valid: false, error: "from is required and must be a string" };
  }

  // Extract email from "Name <email>" format if present
  const fromMatch = cfg.from.match(/<([^>]+)>/) || [null, cfg.from];
  const fromEmail = fromMatch[1];

  if (!EMAIL_REGEX.test(fromEmail)) {
    return {
      valid: false,
      error: `Invalid email address in 'from' field: ${cfg.from}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// DELIVERY
// ============================================================================

/**
 * Resend API response structure.
 */
interface ResendApiResponse {
  id?: string;
  message?: string;
  statusCode?: number;
}

/**
 * Get the Resend API key from environment.
 *
 * @returns API key or null if not configured
 */
export function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

/**
 * Send a notification via email using Resend API.
 *
 * @param config - Email configuration with to and from addresses
 * @param payload - The notification payload
 * @returns Delivery result
 *
 * @example
 * ```ts
 * const result = await sendEmailNotification(
 *   { to: "admin@example.com", from: "CRM <crm@octatech.xyz>" },
 *   { event: "lead.created", lead: { ... } }
 * );
 *
 * if (!result.success) {
 *   console.error("Email notification failed:", result.error);
 * }
 * ```
 */
export async function sendEmailNotification(
  config: EmailConfig,
  payload: NotificationPayload
): Promise<NotificationDeliveryResult> {
  const startTime = Date.now();

  // Validate configuration
  const validation = validateEmailConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      durationMs: Date.now() - startTime,
    };
  }

  // Get API key
  const apiKey = getResendApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: "RESEND_API_KEY environment variable is not configured",
      durationMs: Date.now() - startTime,
    };
  }

  // Format the email
  const { subject, html } = formatEmail(payload);

  // Build request body
  const body = JSON.stringify({
    from: config.from,
    to: config.to.split(",").map((e) => e.trim()),
    subject,
    html,
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, EMAIL_CONFIG.timeoutMs);

  try {
    const response = await fetch(`${EMAIL_CONFIG.apiBaseUrl}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    // Parse response
    let apiResponse: ResendApiResponse;
    try {
      apiResponse = (await response.json()) as ResendApiResponse;
    } catch {
      return {
        success: false,
        error: "Invalid JSON response from Resend API",
        statusCode: response.status,
        durationMs,
      };
    }

    if (response.ok && apiResponse.id) {
      return {
        success: true,
        statusCode: response.status,
        durationMs,
      };
    }

    // Handle rate limiting
    if (response.status === 429) {
      return {
        success: false,
        error: "Resend rate limited. Try again later.",
        statusCode: response.status,
        durationMs,
      };
    }

    return {
      success: false,
      error: `Resend API error: ${apiResponse.message || "Unknown error"}`,
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
          error: `Request timeout after ${EMAIL_CONFIG.timeoutMs}ms`,
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
 * Email notification provider implementation.
 */
export const emailProvider: NotificationProvider = {
  async send(
    config: NotificationConfig,
    payload: NotificationPayload
  ): Promise<NotificationDeliveryResult> {
    if (!isEmailConfig(config)) {
      return {
        success: false,
        error: "Invalid Email configuration",
        durationMs: 0,
      };
    }
    return sendEmailNotification(config, payload);
  },

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    return validateEmailConfig(config);
  },
};
