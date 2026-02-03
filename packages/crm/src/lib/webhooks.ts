/**
 * Webhook Dispatcher Library for the CRM.
 *
 * Implements webhook payload formatting, HMAC-SHA256 signature generation,
 * async delivery with retries, and failure tracking per specs/08-webhooks.md.
 *
 * Security considerations:
 * - Only HTTPS URLs are allowed
 * - Private IP addresses are blocked (10.x, 192.168.x, 127.x, localhost)
 * - HMAC signatures use timing-safe comparison
 * - Webhooks are auto-disabled after 10 consecutive failures
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  webhooks,
  webhookDeliveries,
  type Webhook,
  type WebhookEvent,
  type Lead,
  type LeadActivity,
  webhookEventEnum,
} from "../db";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Webhook delivery configuration.
 */
export const WEBHOOK_CONFIG = {
  /** HTTP request timeout in milliseconds */
  timeoutMs: 30_000,
  /** User-Agent header value */
  userAgent: "Octatech-Webhook/1.0",
  /** Maximum consecutive failures before auto-disable */
  maxFailureCount: 10,
  /** Maximum response body size to store (bytes) */
  maxResponseBodySize: 10_000,
} as const;

/**
 * Retry delay schedule in milliseconds.
 * Attempt 1: Immediate (0)
 * Attempt 2: 1 minute
 * Attempt 3: 5 minutes
 * Attempt 4: 30 minutes
 * Attempt 5: 2 hours
 * Attempt 6: 24 hours (final)
 */
export const RETRY_DELAYS_MS = [
  0,                    // Attempt 1: Immediate
  60_000,               // Attempt 2: 1 minute
  300_000,              // Attempt 3: 5 minutes
  1_800_000,            // Attempt 4: 30 minutes
  7_200_000,            // Attempt 5: 2 hours
  86_400_000,           // Attempt 6: 24 hours
] as const;

/**
 * Private IP address patterns to block.
 */
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
];

/**
 * Valid webhook events as a Set for fast lookup.
 */
export const VALID_WEBHOOK_EVENTS = new Set<string>(webhookEventEnum);

// ============================================================================
// TYPES
// ============================================================================

/**
 * Base webhook payload structure.
 */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: WebhookEventData;
}

/**
 * Event-specific data types.
 */
export type WebhookEventData =
  | LeadCreatedData
  | LeadUpdatedData
  | LeadStatusChangedData
  | LeadDeletedData
  | LeadActivityAddedData;

/**
 * Data for lead.created event.
 */
export interface LeadCreatedData {
  lead: LeadPayload;
}

/**
 * Data for lead.updated event.
 */
export interface LeadUpdatedData {
  lead: LeadPayload;
  changes: Record<string, { old: unknown; new: unknown }>;
}

/**
 * Data for lead.status_changed event.
 */
export interface LeadStatusChangedData {
  lead: LeadSummaryPayload;
  previousStatus: string;
  newStatus: string;
}

/**
 * Data for lead.deleted event.
 */
export interface LeadDeletedData {
  leadId: string;
  name: string;
  email: string;
}

/**
 * Data for lead.activity_added event.
 */
export interface LeadActivityAddedData {
  lead: LeadSummaryPayload;
  activity: ActivityPayload;
}

/**
 * Full lead payload for webhook events.
 */
export interface LeadPayload {
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
  createdAt: string;
}

/**
 * Summary lead payload for webhook events.
 */
export interface LeadSummaryPayload {
  id: string;
  name: string;
  email: string;
  status?: string;
}

/**
 * Activity payload for webhook events.
 */
export interface ActivityPayload {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

/**
 * Webhook delivery result.
 */
export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  responseBody: string | null;
  durationMs: number;
  error?: string;
}

/**
 * Options for dispatching webhooks.
 */
export interface DispatchOptions {
  /** Skip retry logic and deliver once */
  noRetry?: boolean;
  /** Custom delivery ID (for testing) */
  deliveryId?: string;
}

// ============================================================================
// PAYLOAD FORMATTING
// ============================================================================

/**
 * Format a lead.created webhook payload.
 *
 * @param lead - The created lead
 * @returns Formatted webhook payload
 *
 * @example
 * ```ts
 * const payload = formatLeadCreatedPayload(newLead);
 * await dispatchWebhook("lead.created", payload);
 * ```
 */
export function formatLeadCreatedPayload(lead: Lead): WebhookPayload {
  return {
    id: randomUUID(),
    event: "lead.created",
    timestamp: new Date().toISOString(),
    data: {
      lead: formatLeadPayload(lead),
    },
  };
}

/**
 * Format a lead.updated webhook payload.
 *
 * @param lead - The updated lead
 * @param changes - Object mapping field names to old/new values
 * @returns Formatted webhook payload
 *
 * @example
 * ```ts
 * const payload = formatLeadUpdatedPayload(lead, {
 *   notes: { old: null, new: "Interested in Q2" }
 * });
 * ```
 */
export function formatLeadUpdatedPayload(
  lead: Lead,
  changes: Record<string, { old: unknown; new: unknown }>
): WebhookPayload {
  return {
    id: randomUUID(),
    event: "lead.updated",
    timestamp: new Date().toISOString(),
    data: {
      lead: formatLeadPayload(lead),
      changes,
    },
  };
}

/**
 * Format a lead.status_changed webhook payload.
 *
 * @param lead - The lead with updated status
 * @param previousStatus - The previous status value
 * @param newStatus - The new status value
 * @returns Formatted webhook payload
 *
 * @example
 * ```ts
 * const payload = formatLeadStatusChangedPayload(lead, "new", "contacted");
 * ```
 */
export function formatLeadStatusChangedPayload(
  lead: Lead,
  previousStatus: string,
  newStatus: string
): WebhookPayload {
  return {
    id: randomUUID(),
    event: "lead.status_changed",
    timestamp: new Date().toISOString(),
    data: {
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
      },
      previousStatus,
      newStatus,
    },
  };
}

/**
 * Format a lead.deleted webhook payload.
 *
 * @param leadId - The deleted lead's ID
 * @param name - The deleted lead's name
 * @param email - The deleted lead's email
 * @returns Formatted webhook payload
 *
 * @example
 * ```ts
 * const payload = formatLeadDeletedPayload(lead.id, lead.name, lead.email);
 * ```
 */
export function formatLeadDeletedPayload(
  leadId: string,
  name: string,
  email: string
): WebhookPayload {
  return {
    id: randomUUID(),
    event: "lead.deleted",
    timestamp: new Date().toISOString(),
    data: {
      leadId,
      name,
      email,
    },
  };
}

/**
 * Format a lead.activity_added webhook payload.
 *
 * @param lead - The lead the activity was added to
 * @param activity - The added activity
 * @returns Formatted webhook payload
 *
 * @example
 * ```ts
 * const payload = formatLeadActivityAddedPayload(lead, activity);
 * ```
 */
export function formatLeadActivityAddedPayload(
  lead: Lead,
  activity: LeadActivity
): WebhookPayload {
  return {
    id: randomUUID(),
    event: "lead.activity_added",
    timestamp: new Date().toISOString(),
    data: {
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
      },
      activity: {
        id: activity.id,
        type: activity.type,
        description: activity.description,
        createdAt: activity.createdAt.toISOString(),
      },
    },
  };
}

/**
 * Format a full lead payload for webhook events.
 *
 * @param lead - The lead to format
 * @returns Formatted lead payload
 */
function formatLeadPayload(lead: Lead): LeadPayload {
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
    createdAt: lead.createdAt instanceof Date
      ? lead.createdAt.toISOString()
      : String(lead.createdAt),
  };
}

// ============================================================================
// SIGNATURE GENERATION & VERIFICATION
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 *
 * @param secret - The webhook secret
 * @param body - The JSON payload body string
 * @returns Signature string in format "sha256={hex_signature}"
 *
 * @example
 * ```ts
 * const signature = generateSignature("secret123", JSON.stringify(payload));
 * // "sha256=abc123..."
 * ```
 */
export function generateSignature(secret: string, body: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}

/**
 * Verify a webhook signature using timing-safe comparison.
 *
 * @param body - The raw request body string
 * @param signature - The X-Webhook-Signature header value
 * @param secret - The webhook secret
 * @returns true if signature is valid
 *
 * @example
 * ```ts
 * const isValid = verifyWebhookSignature(body, header, secret);
 * if (!isValid) throw new Error("Invalid signature");
 * ```
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = generateSignature(secret, body);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate a webhook URL for security.
 *
 * Requirements:
 * - Must be HTTPS
 * - Must not point to private IP addresses
 * - Must not point to localhost
 *
 * @param url - The URL to validate
 * @returns Object with valid flag and optional error message
 *
 * @example
 * ```ts
 * const result = validateWebhookUrl("https://hooks.example.com/webhook");
 * if (!result.valid) throw new Error(result.error);
 * ```
 */
export function validateWebhookUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  // Must be HTTPS
  if (parsedUrl.protocol !== "https:") {
    return { valid: false, error: "URL must use HTTPS protocol" };
  }

  const hostname = parsedUrl.hostname;

  // Check for private IPs and localhost
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: "Webhooks to private IP addresses or localhost are not allowed",
      };
    }
  }

  return { valid: true };
}

/**
 * Check if a hostname resolves to a private IP address.
 * This performs DNS lookup to detect SSRF attempts.
 *
 * Note: This is an async check that should be done before delivery.
 *
 * @param hostname - The hostname to check
 * @returns true if hostname resolves to a private IP
 */
export async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  try {
    // Use dynamic import for dns/promises to avoid issues in non-Node environments
    const dns = await import("dns/promises");
    const addresses = await dns.lookup(hostname, { all: true });

    for (const addr of addresses) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(addr.address)) {
          return true;
        }
      }
    }

    return false;
  } catch {
    // If DNS lookup fails, allow the request to proceed
    // The HTTP request will fail naturally
    return false;
  }
}

// ============================================================================
// WEBHOOK DELIVERY
// ============================================================================

/**
 * Deliver a webhook payload to a specific webhook endpoint.
 *
 * This function:
 * 1. Validates the webhook URL
 * 2. Generates signature if secret is configured
 * 3. Sends HTTP POST with appropriate headers
 * 4. Handles timeout and errors
 * 5. Returns delivery result
 *
 * @param webhook - The webhook configuration
 * @param payload - The webhook payload to deliver
 * @param options - Delivery options
 * @returns Delivery result with status, response, and timing
 *
 * @example
 * ```ts
 * const result = await deliverWebhook(webhook, payload);
 * if (!result.success) {
 *   console.error("Delivery failed:", result.error);
 * }
 * ```
 */
export async function deliverWebhook(
  webhook: Webhook,
  payload: WebhookPayload,
  options: DispatchOptions = {}
): Promise<DeliveryResult> {
  const deliveryId = options.deliveryId ?? payload.id;
  const body = JSON.stringify(payload);
  const startTime = Date.now();

  // Validate URL security
  const urlValidation = validateWebhookUrl(webhook.url);
  if (!urlValidation.valid) {
    return {
      success: false,
      statusCode: null,
      responseBody: null,
      durationMs: Date.now() - startTime,
      error: urlValidation.error,
    };
  }

  // Check for DNS rebinding attacks (resolve to private IP)
  try {
    const parsedUrl = new URL(webhook.url);
    const isPrivate = await resolvesToPrivateIp(parsedUrl.hostname);
    if (isPrivate) {
      return {
        success: false,
        statusCode: null,
        responseBody: null,
        durationMs: Date.now() - startTime,
        error: "URL resolves to a private IP address",
      };
    }
  } catch {
    // Continue if DNS check fails - the HTTP request will fail naturally
  }

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": WEBHOOK_CONFIG.userAgent,
    "X-Webhook-ID": deliveryId,
    "X-Webhook-Event": payload.event,
    "X-Webhook-Timestamp": Math.floor(Date.now() / 1000).toString(),
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    headers["X-Webhook-Signature"] = generateSignature(webhook.secret, body);
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, WEBHOOK_CONFIG.timeoutMs);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Read response body (truncate if too large)
    let responseBody: string | null = null;
    try {
      const text = await response.text();
      responseBody = text.substring(0, WEBHOOK_CONFIG.maxResponseBodySize);
    } catch {
      // Ignore response body read errors
    }

    const durationMs = Date.now() - startTime;
    const success = response.ok;

    return {
      success,
      statusCode: response.status,
      responseBody,
      durationMs,
      error: success ? undefined : `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;
    let errorMessage = "Unknown error";

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = `Request timeout after ${WEBHOOK_CONFIG.timeoutMs}ms`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      statusCode: null,
      responseBody: null,
      durationMs,
      error: errorMessage,
    };
  }
}

// ============================================================================
// DELIVERY LOGGING
// ============================================================================

/**
 * Log a webhook delivery attempt to the database.
 *
 * @param webhookId - The webhook ID
 * @param event - The event type
 * @param payload - The delivered payload
 * @param result - The delivery result
 * @returns The created delivery record ID
 *
 * @example
 * ```ts
 * const deliveryId = await logDelivery(webhook.id, "lead.created", payload, result);
 * ```
 */
export async function logDelivery(
  webhookId: string,
  event: WebhookEvent,
  payload: WebhookPayload,
  result: DeliveryResult
): Promise<string> {
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      webhookId,
      event,
      payload: payload as unknown as Record<string, unknown>,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      durationMs: result.durationMs,
    })
    .returning({ id: webhookDeliveries.id });

  return delivery.id;
}

// ============================================================================
// FAILURE TRACKING
// ============================================================================

/**
 * Increment the failure count for a webhook.
 * Auto-disables the webhook if failure count exceeds threshold.
 *
 * @param webhookId - The webhook ID
 * @param currentFailureCount - The current failure count
 * @returns Object indicating if webhook was disabled
 *
 * @example
 * ```ts
 * const { disabled } = await incrementFailureCount(webhook.id, webhook.failureCount);
 * if (disabled) {
 *   console.log("Webhook auto-disabled due to failures");
 * }
 * ```
 */
export async function incrementFailureCount(
  webhookId: string,
  currentFailureCount: number
): Promise<{ disabled: boolean }> {
  const newFailureCount = currentFailureCount + 1;
  const shouldDisable = newFailureCount >= WEBHOOK_CONFIG.maxFailureCount;

  await db
    .update(webhooks)
    .set({
      failureCount: newFailureCount,
      enabled: shouldDisable ? false : undefined,
      lastTriggeredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, webhookId));

  return { disabled: shouldDisable };
}

/**
 * Reset the failure count for a webhook on successful delivery.
 * Also updates the last triggered timestamp and status code.
 *
 * @param webhookId - The webhook ID
 * @param statusCode - The successful HTTP status code
 *
 * @example
 * ```ts
 * await resetFailureCount(webhook.id, 200);
 * ```
 */
export async function resetFailureCount(
  webhookId: string,
  statusCode: number
): Promise<void> {
  await db
    .update(webhooks)
    .set({
      failureCount: 0,
      lastTriggeredAt: new Date(),
      lastStatusCode: statusCode,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, webhookId));
}

/**
 * Update webhook status after a delivery attempt.
 *
 * @param webhookId - The webhook ID
 * @param result - The delivery result
 * @param currentFailureCount - Current failure count
 * @returns Object with updated failure info
 */
export async function updateWebhookStatus(
  webhookId: string,
  result: DeliveryResult,
  currentFailureCount: number
): Promise<{ disabled: boolean }> {
  if (result.success) {
    await resetFailureCount(webhookId, result.statusCode!);
    return { disabled: false };
  } else {
    return incrementFailureCount(webhookId, currentFailureCount);
  }
}

// ============================================================================
// WEBHOOK DISPATCHING
// ============================================================================

/**
 * Get all enabled webhooks subscribed to a specific event.
 *
 * @param event - The event type to filter by
 * @returns Array of enabled webhooks subscribed to the event
 *
 * @example
 * ```ts
 * const webhooks = await getWebhooksForEvent("lead.created");
 * ```
 */
export async function getWebhooksForEvent(event: WebhookEvent): Promise<Webhook[]> {
  const allWebhooks = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.enabled, true));

  // Filter to webhooks that include this event
  return allWebhooks.filter((webhook) => webhook.events.includes(event));
}

/**
 * Dispatch a webhook event to all subscribed webhooks.
 *
 * This is the main entry point for triggering webhooks. It:
 * 1. Finds all enabled webhooks subscribed to the event
 * 2. Delivers the payload to each webhook
 * 3. Logs all delivery attempts
 * 4. Updates failure counts
 * 5. Schedules retries for failed deliveries
 *
 * @param event - The event type
 * @param payload - The webhook payload
 * @param options - Dispatch options
 * @returns Array of delivery results with webhook IDs
 *
 * @example
 * ```ts
 * // Dispatch lead.created event
 * const payload = formatLeadCreatedPayload(lead);
 * const results = await dispatchWebhookEvent("lead.created", payload);
 *
 * for (const result of results) {
 *   if (!result.success) {
 *     console.log(`Webhook ${result.webhookId} failed: ${result.error}`);
 *   }
 * }
 * ```
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  payload: WebhookPayload,
  options: DispatchOptions = {}
): Promise<Array<DeliveryResult & { webhookId: string }>> {
  const eventWebhooks = await getWebhooksForEvent(event);
  const results: Array<DeliveryResult & { webhookId: string }> = [];

  // Deliver to all webhooks in parallel
  const deliveryPromises = eventWebhooks.map(async (webhook) => {
    const result = await deliverWebhook(webhook, payload, options);

    // Log the delivery
    await logDelivery(webhook.id, event, payload, result);

    // Update webhook status (failure count, etc.)
    await updateWebhookStatus(webhook.id, result, webhook.failureCount ?? 0);

    // Schedule retry if failed and retries are not disabled
    if (!result.success && !options.noRetry) {
      scheduleRetry(webhook, payload, 1);
    }

    return { ...result, webhookId: webhook.id };
  });

  const settledResults = await Promise.allSettled(deliveryPromises);

  for (const settled of settledResults) {
    if (settled.status === "fulfilled") {
      results.push(settled.value);
    } else {
      // This shouldn't happen but handle it gracefully
      console.error("Webhook dispatch error:", settled.reason);
    }
  }

  return results;
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Schedule a webhook retry with exponential backoff.
 *
 * This function schedules a retry using setTimeout. In a production
 * environment, you would want to use a proper job queue (BullMQ, etc.)
 * for reliable retry handling across restarts.
 *
 * @param webhook - The webhook to retry
 * @param payload - The original payload
 * @param attempt - The current attempt number (1-indexed)
 *
 * @example
 * ```ts
 * // Schedule retry after first failure
 * scheduleRetry(webhook, payload, 1);
 * ```
 */
export function scheduleRetry(
  webhook: Webhook,
  payload: WebhookPayload,
  attempt: number
): void {
  // Check if we've exceeded max retries
  if (attempt >= RETRY_DELAYS_MS.length) {
    console.log(
      `Webhook ${webhook.id} exceeded max retries (${RETRY_DELAYS_MS.length})`
    );
    return;
  }

  const delay = RETRY_DELAYS_MS[attempt];

  console.log(
    `Scheduling retry ${attempt + 1}/${RETRY_DELAYS_MS.length} for webhook ${webhook.id} in ${delay}ms`
  );

  // Schedule the retry
  setTimeout(async () => {
    try {
      await executeRetry(webhook.id, payload, attempt);
    } catch (error) {
      console.error(`Retry failed for webhook ${webhook.id}:`, error);
    }
  }, delay);
}

/**
 * Execute a scheduled webhook retry.
 *
 * @param webhookId - The webhook ID
 * @param payload - The original payload
 * @param attempt - The current attempt number
 */
async function executeRetry(
  webhookId: string,
  payload: WebhookPayload,
  attempt: number
): Promise<void> {
  // Fetch current webhook state (it may have been disabled or deleted)
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1);

  if (!webhook) {
    console.log(`Webhook ${webhookId} no longer exists, skipping retry`);
    return;
  }

  if (!webhook.enabled) {
    console.log(`Webhook ${webhookId} is disabled, skipping retry`);
    return;
  }

  const result = await deliverWebhook(webhook, payload);

  // Log the retry attempt
  await logDelivery(webhook.id, payload.event, payload, result);

  // Update webhook status
  const { disabled } = await updateWebhookStatus(
    webhook.id,
    result,
    webhook.failureCount ?? 0
  );

  if (result.success) {
    console.log(`Webhook ${webhookId} retry ${attempt + 1} succeeded`);
  } else {
    console.log(
      `Webhook ${webhookId} retry ${attempt + 1} failed: ${result.error}`
    );

    // Schedule next retry if not disabled
    if (!disabled) {
      scheduleRetry(webhook, payload, attempt + 1);
    } else {
      console.log(
        `Webhook ${webhookId} has been auto-disabled due to consecutive failures`
      );
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Trigger webhooks for a lead.created event.
 *
 * @param lead - The created lead
 * @returns Dispatch results
 *
 * @example
 * ```ts
 * // After creating a lead
 * const lead = await createLead(data);
 * await triggerLeadCreated(lead);
 * ```
 */
export async function triggerLeadCreated(lead: Lead): Promise<void> {
  const payload = formatLeadCreatedPayload(lead);
  await dispatchWebhookEvent("lead.created", payload);
}

/**
 * Trigger webhooks for a lead.updated event.
 *
 * @param lead - The updated lead
 * @param changes - Object mapping field names to old/new values
 * @returns Dispatch results
 *
 * @example
 * ```ts
 * // After updating a lead
 * const updated = await updateLead(id, data);
 * await triggerLeadUpdated(updated, { notes: { old: null, new: "New note" } });
 * ```
 */
export async function triggerLeadUpdated(
  lead: Lead,
  changes: Record<string, { old: unknown; new: unknown }>
): Promise<void> {
  const payload = formatLeadUpdatedPayload(lead, changes);
  await dispatchWebhookEvent("lead.updated", payload);
}

/**
 * Trigger webhooks for a lead.status_changed event.
 *
 * @param lead - The lead with updated status
 * @param previousStatus - The previous status
 * @param newStatus - The new status
 * @returns Dispatch results
 *
 * @example
 * ```ts
 * // After changing lead status
 * await triggerLeadStatusChanged(lead, "new", "contacted");
 * ```
 */
export async function triggerLeadStatusChanged(
  lead: Lead,
  previousStatus: string,
  newStatus: string
): Promise<void> {
  const payload = formatLeadStatusChangedPayload(lead, previousStatus, newStatus);
  await dispatchWebhookEvent("lead.status_changed", payload);
}

/**
 * Trigger webhooks for a lead.deleted event.
 *
 * @param leadId - The deleted lead's ID
 * @param name - The deleted lead's name
 * @param email - The deleted lead's email
 * @returns Dispatch results
 *
 * @example
 * ```ts
 * // Before deleting a lead (capture info first)
 * const { id, name, email } = lead;
 * await deleteLead(id);
 * await triggerLeadDeleted(id, name, email);
 * ```
 */
export async function triggerLeadDeleted(
  leadId: string,
  name: string,
  email: string
): Promise<void> {
  const payload = formatLeadDeletedPayload(leadId, name, email);
  await dispatchWebhookEvent("lead.deleted", payload);
}

/**
 * Trigger webhooks for a lead.activity_added event.
 *
 * @param lead - The lead the activity was added to
 * @param activity - The added activity
 * @returns Dispatch results
 *
 * @example
 * ```ts
 * // After adding an activity
 * const activity = await addActivity(leadId, data);
 * await triggerLeadActivityAdded(lead, activity);
 * ```
 */
export async function triggerLeadActivityAdded(
  lead: Lead,
  activity: LeadActivity
): Promise<void> {
  const payload = formatLeadActivityAddedPayload(lead, activity);
  await dispatchWebhookEvent("lead.activity_added", payload);
}

// ============================================================================
// WEBHOOK MANAGEMENT
// ============================================================================

/**
 * Options for creating a webhook.
 */
export interface CreateWebhookOptions {
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  enabled?: boolean;
}

/**
 * Create a new webhook.
 *
 * @param options - Webhook creation options
 * @returns The created webhook
 *
 * @example
 * ```ts
 * const webhook = await createWebhook({
 *   name: "Zapier Integration",
 *   url: "https://hooks.zapier.com/...",
 *   events: ["lead.created", "lead.status_changed"],
 *   secret: "my-secret",
 * });
 * ```
 */
export async function createWebhook(options: CreateWebhookOptions): Promise<Webhook> {
  // Validate URL
  const urlValidation = validateWebhookUrl(options.url);
  if (!urlValidation.valid) {
    throw new Error(`Invalid webhook URL: ${urlValidation.error}`);
  }

  // Validate events
  for (const event of options.events) {
    if (!VALID_WEBHOOK_EVENTS.has(event)) {
      throw new Error(`Invalid webhook event: ${event}`);
    }
  }

  const [webhook] = await db
    .insert(webhooks)
    .values({
      name: options.name,
      url: options.url,
      events: options.events,
      secret: options.secret ?? null,
      enabled: options.enabled ?? true,
    })
    .returning();

  return webhook;
}

/**
 * Options for updating a webhook.
 */
export interface UpdateWebhookOptions {
  name?: string;
  url?: string;
  events?: WebhookEvent[];
  secret?: string | null;
  enabled?: boolean;
}

/**
 * Update an existing webhook.
 *
 * @param id - The webhook ID
 * @param options - Update options
 * @returns The updated webhook or null if not found
 *
 * @example
 * ```ts
 * const updated = await updateWebhook(id, {
 *   name: "Updated Name",
 *   events: ["lead.created"],
 * });
 * ```
 */
export async function updateWebhook(
  id: string,
  options: UpdateWebhookOptions
): Promise<Webhook | null> {
  // Validate URL if provided
  if (options.url) {
    const urlValidation = validateWebhookUrl(options.url);
    if (!urlValidation.valid) {
      throw new Error(`Invalid webhook URL: ${urlValidation.error}`);
    }
  }

  // Validate events if provided
  if (options.events) {
    for (const event of options.events) {
      if (!VALID_WEBHOOK_EVENTS.has(event)) {
        throw new Error(`Invalid webhook event: ${event}`);
      }
    }
  }

  const updates: Partial<{
    name: string;
    url: string;
    events: string[];
    secret: string | null;
    enabled: boolean;
    updatedAt: Date;
  }> = {
    updatedAt: new Date(),
  };

  if (options.name !== undefined) updates.name = options.name;
  if (options.url !== undefined) updates.url = options.url;
  if (options.events !== undefined) updates.events = options.events;
  if (options.secret !== undefined) updates.secret = options.secret;
  if (options.enabled !== undefined) updates.enabled = options.enabled;

  const [webhook] = await db
    .update(webhooks)
    .set(updates)
    .where(eq(webhooks.id, id))
    .returning();

  return webhook ?? null;
}

/**
 * Get a webhook by ID.
 *
 * @param id - The webhook ID
 * @returns The webhook or null if not found
 */
export async function getWebhook(id: string): Promise<Webhook | null> {
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  return webhook ?? null;
}

/**
 * List all webhooks.
 *
 * @param includeDisabled - Include disabled webhooks (default: true)
 * @returns Array of webhooks
 */
export async function listWebhooks(includeDisabled = true): Promise<Webhook[]> {
  if (includeDisabled) {
    return db.select().from(webhooks);
  }

  return db.select().from(webhooks).where(eq(webhooks.enabled, true));
}

/**
 * Delete a webhook and its delivery history.
 *
 * @param id - The webhook ID
 * @returns true if deleted, false if not found
 */
export async function deleteWebhook(id: string): Promise<boolean> {
  const [deleted] = await db
    .delete(webhooks)
    .where(eq(webhooks.id, id))
    .returning();

  return !!deleted;
}

/**
 * Send a test webhook delivery.
 *
 * This sends a test payload to the webhook endpoint and returns the result.
 * The delivery is logged but doesn't affect failure count.
 *
 * @param id - The webhook ID
 * @returns Test delivery result
 *
 * @example
 * ```ts
 * const result = await sendTestWebhook(webhookId);
 * if (result.success) {
 *   console.log("Test successful:", result.statusCode);
 * }
 * ```
 */
export async function sendTestWebhook(id: string): Promise<DeliveryResult | null> {
  const webhook = await getWebhook(id);
  if (!webhook) {
    return null;
  }

  // Create test payload
  const testPayload: WebhookPayload = {
    id: randomUUID(),
    event: "lead.created",
    timestamp: new Date().toISOString(),
    data: {
      lead: {
        id: "test-lead-id",
        name: "Test Lead",
        email: "test@example.com",
        company: "Test Company",
        phone: "+1-555-0000",
        budget: "$10,000 - $25,000",
        projectType: "Test Project",
        message: "This is a test webhook delivery",
        source: "Webhook Test",
        status: "new",
        createdAt: new Date().toISOString(),
      },
    },
  };

  const result = await deliverWebhook(webhook, testPayload, { noRetry: true });

  // Log the test delivery
  await logDelivery(webhook.id, "lead.created", testPayload, result);

  // Update last triggered timestamp but don't affect failure count
  await db
    .update(webhooks)
    .set({
      lastTriggeredAt: new Date(),
      lastStatusCode: result.statusCode,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, id));

  return result;
}

/**
 * Get delivery history for a webhook.
 *
 * @param webhookId - The webhook ID
 * @param options - Pagination options
 * @returns Delivery records and pagination info
 */
export async function getDeliveryHistory(
  webhookId: string,
  options: { page?: number; limit?: number } = {}
): Promise<{
  deliveries: Array<{
    id: string;
    event: string;
    statusCode: number | null;
    durationMs: number | null;
    attemptedAt: Date;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const offset = (page - 1) * limit;

  // Get total count
  const allDeliveries = await db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId));

  const total = allDeliveries.length;

  // Get paginated deliveries
  const deliveries = await db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      statusCode: webhookDeliveries.statusCode,
      durationMs: webhookDeliveries.durationMs,
      attemptedAt: webhookDeliveries.attemptedAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(webhookDeliveries.attemptedAt)
    .limit(limit)
    .offset(offset);

  return {
    deliveries,
    pagination: {
      page,
      limit,
      total,
    },
  };
}

/**
 * Re-enable a webhook that was auto-disabled.
 * Also resets the failure count.
 *
 * @param id - The webhook ID
 * @returns The updated webhook or null if not found
 */
export async function reenableWebhook(id: string): Promise<Webhook | null> {
  const [webhook] = await db
    .update(webhooks)
    .set({
      enabled: true,
      failureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, id))
    .returning();

  return webhook ?? null;
}
