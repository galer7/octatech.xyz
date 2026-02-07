/**
 * Admin webhook management routes.
 *
 * Implements CRUD operations for webhooks per specs/08-webhooks.md.
 * All routes require admin session authentication.
 *
 * Webhooks allow external systems to receive HTTP notifications
 * when events occur in the CRM (lead created, status changed, etc.).
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  webhooks,
  webhookDeliveries,
  webhookEventEnum,
  type NewWebhook,
} from "../../db/index.js";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth.js";
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors.js";

/**
 * Admin webhooks routes app instance.
 */
export const adminWebhooksRoutes = new Hono();

// All routes require admin authentication
adminWebhooksRoutes.use("*", requireAuth);

/**
 * Valid webhook events from the schema.
 */
const VALID_EVENTS = new Set<string>(webhookEventEnum);

/**
 * Regular expression for validating HTTPS URLs.
 * Only HTTPS URLs are allowed for security.
 */
const HTTPS_URL_REGEX = /^https:\/\/.+/i;

/**
 * Private/internal IP address patterns that are blocked for security.
 * Prevents SSRF attacks by blocking webhooks to internal networks.
 */
const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/10\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^https?:\/\/0\./,
  /^https?:\/\/\[::1\]/,
];

/**
 * Check if a URL points to a private/internal network.
 *
 * @param url - The URL to check
 * @returns True if the URL is private, false otherwise
 */
function isPrivateUrl(url: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Schema for creating a webhook.
 */
const createWebhookSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be at most 255 characters"),
  url: z
    .string()
    .min(1, "URL is required")
    .refine((url) => HTTPS_URL_REGEX.test(url), {
      message: "URL must be a valid HTTPS URL",
    })
    .refine((url) => !isPrivateUrl(url), {
      message: "URL must not point to a private/internal network",
    }),
  events: z
    .array(z.string())
    .min(1, "At least one event is required")
    .refine((events) => events.every((e) => VALID_EVENTS.has(e)), {
      message: `Invalid event. Valid events are: ${Array.from(VALID_EVENTS).join(", ")}`,
    }),
  secret: z
    .string()
    .min(16, "Secret must be at least 16 characters for security")
    .max(255, "Secret must be at most 255 characters")
    .optional()
    .nullable(),
});

/**
 * Schema for updating a webhook.
 */
const updateWebhookSchema = z.object({
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(255, "Name must be at most 255 characters")
    .optional(),
  url: z
    .string()
    .refine((url) => HTTPS_URL_REGEX.test(url), {
      message: "URL must be a valid HTTPS URL",
    })
    .refine((url) => !isPrivateUrl(url), {
      message: "URL must not point to a private/internal network",
    })
    .optional(),
  events: z
    .array(z.string())
    .min(1, "At least one event is required")
    .refine((events) => events.every((e) => VALID_EVENTS.has(e)), {
      message: `Invalid event. Valid events are: ${Array.from(VALID_EVENTS).join(", ")}`,
    })
    .optional(),
  secret: z
    .string()
    .min(16, "Secret must be at least 16 characters for security")
    .max(255, "Secret must be at most 255 characters")
    .optional()
    .nullable(),
  enabled: z.boolean().optional(),
});

/**
 * Parse and validate request body with Zod schema.
 * Returns validation errors in a consistent format.
 *
 * @param schema - The Zod schema to validate against
 * @param body - The request body to validate
 * @returns The validated and typed data
 * @throws ValidationError if validation fails
 */
function parseAndValidate<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const parseResult = schema.safeParse(body);

  if (!parseResult.success) {
    const errors: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path[0]?.toString() || "unknown";
      errors[field] = issue.message;
    }
    throw new ValidationError("Invalid request", errors);
  }

  return parseResult.data;
}

/**
 * GET /api/admin/webhooks
 *
 * List all webhooks.
 * Returns webhooks with their configuration and status information.
 *
 * @response 200 - List of webhooks
 */
adminWebhooksRoutes.get("/", async (c) => {
  const allWebhooks = await db
    .select()
    .from(webhooks)
    .orderBy(desc(webhooks.createdAt));

  return c.json({
    webhooks: allWebhooks.map((webhook) => ({
      id: webhook.id,
      name: webhook.name,
      url: webhook.url,
      events: webhook.events,
      enabled: webhook.enabled,
      lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() || null,
      lastStatusCode: webhook.lastStatusCode,
      failureCount: webhook.failureCount,
      createdAt: webhook.createdAt.toISOString(),
      updatedAt: webhook.updatedAt.toISOString(),
    })),
  });
});

/**
 * GET /api/admin/webhooks/:id
 *
 * Get a single webhook by ID.
 *
 * @param id - The webhook ID (UUID)
 * @response 200 - The webhook
 * @response 404 - Webhook not found
 */
adminWebhooksRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  if (!webhook) {
    throw new NotFoundError("Webhook");
  }

  return c.json({
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    enabled: webhook.enabled,
    lastTriggeredAt: webhook.lastTriggeredAt?.toISOString() || null,
    lastStatusCode: webhook.lastStatusCode,
    failureCount: webhook.failureCount,
    createdAt: webhook.createdAt.toISOString(),
    updatedAt: webhook.updatedAt.toISOString(),
  });
});

/**
 * POST /api/admin/webhooks
 *
 * Create a new webhook.
 *
 * @body name - Friendly name for the webhook (e.g., "Zapier Integration")
 * @body url - HTTPS URL to receive webhook notifications
 * @body events - Array of event types to subscribe to
 * @body secret - Optional shared secret for HMAC signature verification
 * @response 201 - Created webhook
 */
adminWebhooksRoutes.post("/", requireCsrfHeader, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, url, events, secret } = parseAndValidate(
    createWebhookSchema,
    body
  );

  const [created] = await db
    .insert(webhooks)
    .values({
      name,
      url,
      events,
      secret: secret || null,
      enabled: true,
      failureCount: 0,
    })
    .returning();

  return c.json(
    {
      id: created.id,
      name: created.name,
      url: created.url,
      events: created.events,
      enabled: created.enabled,
      lastTriggeredAt: null,
      lastStatusCode: null,
      failureCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201
  );
});

/**
 * PATCH /api/admin/webhooks/:id
 *
 * Update a webhook's configuration.
 *
 * @param id - The webhook ID (UUID)
 * @body name - New name (optional)
 * @body url - New URL (optional)
 * @body events - New events array (optional)
 * @body secret - New secret (optional, pass null to remove)
 * @body enabled - Enable/disable webhook (optional)
 * @response 200 - Updated webhook
 * @response 404 - Webhook not found
 */
adminWebhooksRoutes.patch("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  const body = await c.req.json().catch(() => ({}));
  const data = parseAndValidate(updateWebhookSchema, body);

  // Check if there's anything to update
  if (
    data.name === undefined &&
    data.url === undefined &&
    data.events === undefined &&
    data.secret === undefined &&
    data.enabled === undefined
  ) {
    throw new BadRequestError(
      "At least one field (name, url, events, secret, or enabled) is required"
    );
  }

  // Check if webhook exists
  const [existing] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Webhook");
  }

  // Build update object with only provided fields
  const updateData: Partial<NewWebhook> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.url !== undefined) updateData.url = data.url;
  if (data.events !== undefined) updateData.events = data.events;
  if (data.secret !== undefined) updateData.secret = data.secret;
  if (data.enabled !== undefined) {
    updateData.enabled = data.enabled;
    // Reset failure count when re-enabling
    if (data.enabled && !existing.enabled) {
      (updateData as Record<string, unknown>).failureCount = 0;
    }
  }

  const [updated] = await db
    .update(webhooks)
    .set(updateData)
    .where(eq(webhooks.id, id))
    .returning();

  return c.json({
    id: updated.id,
    name: updated.name,
    url: updated.url,
    events: updated.events,
    enabled: updated.enabled,
    lastTriggeredAt: updated.lastTriggeredAt?.toISOString() || null,
    lastStatusCode: updated.lastStatusCode,
    failureCount: updated.failureCount,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

/**
 * DELETE /api/admin/webhooks/:id
 *
 * Delete a webhook.
 * This also deletes all associated delivery history (CASCADE).
 *
 * @param id - The webhook ID (UUID)
 * @response 200 - Webhook deleted
 * @response 404 - Webhook not found
 */
adminWebhooksRoutes.delete("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(webhooks)
    .where(eq(webhooks.id, id))
    .returning({ id: webhooks.id });

  if (!deleted) {
    throw new NotFoundError("Webhook");
  }

  return c.json({
    success: true,
    message: "Webhook deleted",
  });
});

/**
 * POST /api/admin/webhooks/:id/test
 *
 * Send a test webhook to verify the endpoint is working.
 * Uses mock lead data to simulate a real webhook delivery.
 *
 * @param id - The webhook ID (UUID)
 * @response 200 - Test result with status code and response
 * @response 404 - Webhook not found
 */
adminWebhooksRoutes.post("/:id/test", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  // Get the webhook
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  if (!webhook) {
    throw new NotFoundError("Webhook");
  }

  // Create test payload with mock lead data
  const testDeliveryId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const testPayload = {
    id: testDeliveryId,
    event: "lead.created" as const,
    timestamp,
    data: {
      lead: {
        id: "test-lead-00000000-0000-0000-0000-000000000000",
        name: "Test Lead",
        email: "test@example.com",
        company: "Test Company Inc",
        phone: "+1-555-0123",
        budget: "$10,000 - $50,000",
        projectType: "Test Project",
        message: "This is a test webhook delivery to verify your endpoint.",
        source: "Test",
        status: "new",
        createdAt: timestamp,
      },
    },
  };

  const payloadString = JSON.stringify(testPayload);

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Octatech-Webhook/1.0",
    "X-Webhook-ID": testDeliveryId,
    "X-Webhook-Event": "lead.created",
    "X-Webhook-Timestamp": String(Math.floor(Date.now() / 1000)),
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhook.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payloadString)
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    headers["X-Webhook-Signature"] = `sha256=${signatureHex}`;
  }

  // Send the test webhook
  const startTime = Date.now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    statusCode = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;

    // Truncate response body if too long
    if (responseBody && responseBody.length > 1000) {
      responseBody = responseBody.substring(0, 1000) + "... (truncated)";
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        responseBody = "Request timed out after 30 seconds";
      } else {
        responseBody = `Request failed: ${error.message}`;
      }
    } else {
      responseBody = "Request failed with unknown error";
    }
  }

  const responseTime = Date.now() - startTime;

  // Log the test delivery
  await db.insert(webhookDeliveries).values({
    webhookId: webhook.id,
    event: "lead.created",
    payload: testPayload,
    statusCode,
    responseBody,
    durationMs: responseTime,
  });

  return c.json({
    success,
    statusCode,
    responseTime,
    responseBody,
  });
});

/**
 * GET /api/admin/webhooks/:id/deliveries
 *
 * Get paginated delivery history for a webhook.
 *
 * @param id - The webhook ID (UUID)
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 20, max: 100)
 * @response 200 - Paginated list of deliveries
 * @response 404 - Webhook not found
 */
adminWebhooksRoutes.get("/:id/deliveries", async (c) => {
  const id = c.req.param("id");

  // Check if webhook exists
  const [webhook] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.id, id))
    .limit(1);

  if (!webhook) {
    throw new NotFoundError("Webhook");
  }

  // Parse pagination params with defaults
  const pageParam = c.req.query("page");
  const limitParam = c.req.query("limit");
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const limit = limitParam
    ? Math.min(100, Math.max(1, parseInt(limitParam, 10) || 20))
    : 20;
  const offset = (page - 1) * limit;

  // Get total count
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id));

  // Get deliveries
  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.attemptedAt))
    .limit(limit)
    .offset(offset);

  const totalPages = Math.ceil(totalCount / limit);

  return c.json({
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      event: delivery.event,
      payload: delivery.payload,
      statusCode: delivery.statusCode,
      responseBody: delivery.responseBody,
      durationMs: delivery.durationMs,
      attemptedAt: delivery.attemptedAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages,
      hasMore: page < totalPages,
    },
  });
});

/**
 * GET /api/admin/webhooks/events/list
 *
 * List all available webhook event types.
 * Useful for populating UI dropdowns when creating/editing webhooks.
 *
 * @response 200 - List of events with descriptions
 */
adminWebhooksRoutes.get("/events/list", async (c) => {
  const eventDescriptions: Record<string, string> = {
    "lead.created": "Triggered when a new lead is added",
    "lead.updated": "Triggered when lead information is changed",
    "lead.status_changed": "Triggered when a lead's status changes",
    "lead.deleted": "Triggered when a lead is removed",
    "lead.activity_added": "Triggered when an activity is added to a lead",
  };

  const events = webhookEventEnum.map((event) => ({
    event,
    description: eventDescriptions[event] || event,
  }));

  return c.json({ events });
});
