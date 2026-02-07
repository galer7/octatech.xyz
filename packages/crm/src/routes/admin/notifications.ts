/**
 * Admin notification channel management routes.
 *
 * Implements CRUD operations for notification channels per specs/09-notifications.md.
 * All routes require admin session authentication.
 *
 * Notification channels allow the CRM to send alerts to Discord, Telegram,
 * and Email when events occur (primarily new leads).
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import {
  db,
  notificationChannels,
  notificationChannelTypeEnum,
  type NewNotificationChannel,
  type NotificationConfig,
} from "../../db/index.js";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth.js";
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors.js";
import {
  validateChannelConfig,
  sendTestNotification,
  notificationEventEnum,
  VALID_NOTIFICATION_EVENTS,
} from "../../lib/notifications/index.js";

/**
 * Admin notification routes app instance.
 */
export const adminNotificationsRoutes = new Hono();

// All routes require admin authentication
adminNotificationsRoutes.use("*", requireAuth);

/**
 * Valid notification channel types from the schema.
 */
const VALID_CHANNEL_TYPES = new Set<string>(notificationChannelTypeEnum);

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for Discord configuration.
 */
const discordConfigSchema = z.object({
  webhook_url: z
    .string()
    .min(1, "webhook_url is required")
    .regex(
      /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/,
      "Invalid Discord webhook URL"
    ),
});

/**
 * Schema for Telegram configuration.
 */
const telegramConfigSchema = z.object({
  bot_token: z
    .string()
    .min(1, "bot_token is required")
    .regex(/^\d+:[\w-]+$/, "Invalid bot_token format"),
  chat_id: z
    .string()
    .min(1, "chat_id is required")
    .regex(/^-?\d+$/, "chat_id must be a numeric string"),
});

/**
 * Schema for Email configuration.
 */
const emailConfigSchema = z.object({
  to: z
    .string()
    .min(1, "to is required")
    .refine(
      (val) => {
        const emails = val.split(",").map((e) => e.trim());
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emails.every((email) => {
          const match = email.match(/<([^>]+)>/) || [null, email];
          return emailRegex.test(match[1]);
        });
      },
      { message: "Invalid email address in 'to' field" }
    ),
  from: z
    .string()
    .min(1, "from is required")
    .refine(
      (val) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const match = val.match(/<([^>]+)>/) || [null, val];
        return emailRegex.test(match[1]);
      },
      { message: "Invalid email address in 'from' field" }
    ),
});

/**
 * Get config schema based on channel type.
 */
function getConfigSchema(type: string) {
  switch (type) {
    case "discord":
      return discordConfigSchema;
    case "telegram":
      return telegramConfigSchema;
    case "email":
      return emailConfigSchema;
    default:
      return z.object({}).passthrough();
  }
}

/**
 * Schema for creating a notification channel.
 */
const createChannelSchema = z
  .object({
    type: z.string().refine((val) => VALID_CHANNEL_TYPES.has(val), {
      message: `type must be one of: ${Array.from(VALID_CHANNEL_TYPES).join(", ")}`,
    }),
    name: z
      .string()
      .min(1, "Name is required")
      .max(255, "Name must be at most 255 characters"),
    config: z.record(z.unknown()),
    events: z
      .array(z.string())
      .min(1, "At least one event is required")
      .refine((events) => events.every((e) => VALID_NOTIFICATION_EVENTS.has(e)), {
        message: `Invalid event. Valid events are: ${notificationEventEnum.join(", ")}`,
      }),
  })
  .superRefine((data, ctx) => {
    const configSchema = getConfigSchema(data.type);
    const result = configSchema.safeParse(data.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["config", ...issue.path],
          message: issue.message,
        });
      }
    }
  });

/**
 * Schema for updating a notification channel.
 */
const updateChannelSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name cannot be empty")
      .max(255, "Name must be at most 255 characters")
      .optional(),
    config: z.record(z.unknown()).optional(),
    events: z
      .array(z.string())
      .min(1, "At least one event is required")
      .refine((events) => events.every((e) => VALID_NOTIFICATION_EVENTS.has(e)), {
        message: `Invalid event. Valid events are: ${notificationEventEnum.join(", ")}`,
      })
      .optional(),
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
      const field = issue.path.join(".") || "unknown";
      errors[field] = issue.message;
    }
    throw new ValidationError("Invalid request", errors);
  }

  return parseResult.data;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/admin/notifications
 *
 * List all notification channels.
 * Returns channels with their configuration and status information.
 *
 * @response 200 - List of notification channels
 */
adminNotificationsRoutes.get("/", async (c) => {
  const channels = await db
    .select()
    .from(notificationChannels)
    .orderBy(desc(notificationChannels.createdAt));

  return c.json({
    channels: channels.map((channel) => ({
      id: channel.id,
      type: channel.type,
      name: channel.name,
      config: channel.config,
      events: channel.events,
      enabled: channel.enabled,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    })),
  });
});

/**
 * GET /api/admin/notifications/:id
 *
 * Get a single notification channel by ID.
 *
 * @param id - The channel ID (UUID)
 * @response 200 - The notification channel
 * @response 404 - Channel not found
 */
adminNotificationsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, id))
    .limit(1);

  if (!channel) {
    throw new NotFoundError("Notification channel");
  }

  return c.json({
    id: channel.id,
    type: channel.type,
    name: channel.name,
    config: channel.config,
    events: channel.events,
    enabled: channel.enabled,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
  });
});

/**
 * POST /api/admin/notifications
 *
 * Create a new notification channel.
 *
 * @body type - Channel type (discord, telegram, email)
 * @body name - Friendly name for the channel
 * @body config - Type-specific configuration
 * @body events - Array of event types to subscribe to
 * @response 201 - Created notification channel
 */
adminNotificationsRoutes.post("/", requireCsrfHeader, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { type, name, config, events } = parseAndValidate(
    createChannelSchema,
    body
  );

  const [created] = await db
    .insert(notificationChannels)
    .values({
      type,
      name,
      config: config as NotificationConfig,
      events,
      enabled: true,
    })
    .returning();

  return c.json(
    {
      id: created.id,
      type: created.type,
      name: created.name,
      config: created.config,
      events: created.events,
      enabled: created.enabled,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
    201
  );
});

/**
 * PATCH /api/admin/notifications/:id
 *
 * Update a notification channel's configuration.
 *
 * @param id - The channel ID (UUID)
 * @body name - New name (optional)
 * @body config - New configuration (optional)
 * @body events - New events array (optional)
 * @body enabled - Enable/disable channel (optional)
 * @response 200 - Updated notification channel
 * @response 404 - Channel not found
 */
adminNotificationsRoutes.patch("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  const body = await c.req.json().catch(() => ({}));
  const data = parseAndValidate(updateChannelSchema, body);

  // Check if there's anything to update
  if (
    data.name === undefined &&
    data.config === undefined &&
    data.events === undefined &&
    data.enabled === undefined
  ) {
    throw new BadRequestError(
      "At least one field (name, config, events, or enabled) is required"
    );
  }

  // Check if channel exists
  const [existing] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, id))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Notification channel");
  }

  // If config is being updated, validate it against the channel type
  if (data.config !== undefined) {
    const configValidation = validateChannelConfig(
      existing.type as "discord" | "telegram" | "email",
      data.config
    );
    if (!configValidation.valid) {
      throw new ValidationError("Invalid configuration", {
        config: configValidation.error || "Invalid configuration",
      });
    }
  }

  // Build update object with only provided fields
  const updateData: Partial<NewNotificationChannel> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.config !== undefined)
    updateData.config = data.config as typeof existing.config;
  if (data.events !== undefined) updateData.events = data.events;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;

  const [updated] = await db
    .update(notificationChannels)
    .set(updateData)
    .where(eq(notificationChannels.id, id))
    .returning();

  return c.json({
    id: updated.id,
    type: updated.type,
    name: updated.name,
    config: updated.config,
    events: updated.events,
    enabled: updated.enabled,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

/**
 * DELETE /api/admin/notifications/:id
 *
 * Delete a notification channel.
 *
 * @param id - The channel ID (UUID)
 * @response 200 - Channel deleted
 * @response 404 - Channel not found
 */
adminNotificationsRoutes.delete("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(notificationChannels)
    .where(eq(notificationChannels.id, id))
    .returning({ id: notificationChannels.id });

  if (!deleted) {
    throw new NotFoundError("Notification channel");
  }

  return c.json({
    success: true,
    message: "Notification channel deleted",
  });
});

/**
 * POST /api/admin/notifications/:id/test
 *
 * Send a test notification to verify the channel is working.
 * Uses mock lead data to simulate a real notification.
 *
 * @param id - The channel ID (UUID)
 * @response 200 - Test result with success/failure status
 * @response 404 - Channel not found
 */
adminNotificationsRoutes.post("/:id/test", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  // Check if channel exists
  const [channel] = await db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.id, id))
    .limit(1);

  if (!channel) {
    throw new NotFoundError("Notification channel");
  }

  // Send test notification
  const result = await sendTestNotification(id);

  if (!result) {
    throw new NotFoundError("Notification channel");
  }

  return c.json({
    success: result.success,
    message: result.success
      ? "Test notification sent successfully"
      : `Test notification failed: ${result.error}`,
    durationMs: result.durationMs,
    statusCode: result.statusCode,
    error: result.error,
  });
});

/**
 * GET /api/admin/notifications/events/list
 *
 * List all available notification event types.
 * Useful for populating UI dropdowns when creating/editing channels.
 *
 * @response 200 - List of events with descriptions
 */
adminNotificationsRoutes.get("/events/list", async (c) => {
  const eventDescriptions: Record<string, string> = {
    "lead.created": "Triggered when a new lead is added",
    "lead.status_changed": "Triggered when a lead's status changes",
  };

  const events = notificationEventEnum.map((event: string) => ({
    event,
    description: eventDescriptions[event] || event,
    defaultEnabled: event === "lead.created",
  }));

  return c.json({ events });
});

/**
 * GET /api/admin/notifications/types/list
 *
 * List all available notification channel types.
 * Useful for populating UI dropdowns when creating channels.
 *
 * @response 200 - List of channel types with configuration hints
 */
adminNotificationsRoutes.get("/types/list", async (c) => {
  const types = [
    {
      type: "discord",
      name: "Discord",
      description: "Send notifications to a Discord channel via webhook",
      configFields: [
        {
          name: "webhook_url",
          label: "Webhook URL",
          type: "url",
          placeholder: "https://discord.com/api/webhooks/...",
          hint: "Create a webhook in Discord Server Settings → Integrations → Webhooks",
        },
      ],
    },
    {
      type: "telegram",
      name: "Telegram",
      description: "Send notifications to a Telegram chat via bot",
      configFields: [
        {
          name: "bot_token",
          label: "Bot Token",
          type: "password",
          placeholder: "123456:ABC-DEF...",
          hint: "Get token from @BotFather",
        },
        {
          name: "chat_id",
          label: "Chat ID",
          type: "text",
          placeholder: "-1001234567890",
          hint: "Get chat ID from @userinfobot or /getUpdates API",
        },
      ],
    },
    {
      type: "email",
      name: "Email",
      description: "Send notifications via email using Resend",
      configFields: [
        {
          name: "to",
          label: "Recipient(s)",
          type: "email",
          placeholder: "admin@example.com, team@example.com",
          hint: "Comma-separated list of email addresses",
        },
        {
          name: "from",
          label: "Sender",
          type: "email",
          placeholder: "CRM <crm@octatech.xyz>",
          hint: "Must be from a verified domain in Resend",
        },
      ],
    },
  ];

  return c.json({ types });
});
