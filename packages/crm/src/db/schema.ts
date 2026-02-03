import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================================
// LEAD MANAGEMENT TABLES
// ============================================================================

/**
 * Lead status values representing the sales pipeline stages.
 * new → contacted → qualified → proposal → won/lost
 */
export const leadStatusEnum = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof leadStatusEnum)[number];

/**
 * Primary table for storing lead/contact information from contact forms,
 * API integrations, and AI-parsed inputs.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    // Contact Information
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }),
    phone: varchar("phone", { length: 50 }),

    // Lead Details
    budget: varchar("budget", { length: 100 }),
    projectType: varchar("project_type", { length: 100 }),
    message: text("message").notNull(),
    source: varchar("source", { length: 100 }),

    // Lifecycle
    status: varchar("status", { length: 50 }).notNull().default("new"),

    // Metadata
    notes: text("notes"),
    tags: text("tags").array(),

    // AI-parsed data (when lead created via natural language)
    rawInput: text("raw_input"),
    aiParsed: boolean("ai_parsed").default(false),

    // Tracking
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_leads_status").on(table.status),
    index("idx_leads_email").on(table.email),
    index("idx_leads_created_at").on(table.createdAt.desc()),
    check(
      "valid_status",
      sql`${table.status} IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')`
    ),
  ]
);

/**
 * Activity types for lead interactions.
 */
export const activityTypeEnum = [
  "note",
  "email",
  "call",
  "meeting",
  "status_change",
] as const;
export type ActivityType = (typeof activityTypeEnum)[number];

/**
 * Activity log for each lead tracking all interactions and status changes.
 * Provides a complete audit trail of the lead lifecycle.
 */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),

    type: varchar("type", { length: 50 }).notNull(),
    description: text("description").notNull(),

    // For status changes
    oldStatus: varchar("old_status", { length: 50 }),
    newStatus: varchar("new_status", { length: 50 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_lead_activities_lead_id").on(table.leadId)]
);

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Available scopes for API key permissions.
 * Allows granular control over what operations an API key can perform.
 */
export const apiKeyScopeEnum = [
  "leads:read",
  "leads:write",
  "leads:delete",
  "leads:*",
] as const;
export type ApiKeyScope = (typeof apiKeyScopeEnum)[number];

/**
 * API keys for external integrations (Claude bot, Zapier, etc.).
 * Keys are stored as SHA-256 hashes for security - the full key
 * is only displayed once at creation time.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    name: varchar("name", { length: 255 }).notNull(),
    keyHash: varchar("key_hash", { length: 255 }).notNull().unique(),
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),

    // Permissions
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),

    // Tracking
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("idx_api_keys_key_hash").on(table.keyHash)]
);

// ============================================================================
// WEBHOOK SYSTEM
// ============================================================================

/**
 * Supported webhook event types.
 */
export const webhookEventEnum = [
  "lead.created",
  "lead.updated",
  "lead.status_changed",
  "lead.deleted",
  "lead.activity_added",
] as const;
export type WebhookEvent = (typeof webhookEventEnum)[number];

/**
 * Webhook configurations for external notifications.
 * Supports HMAC signature verification and automatic failure tracking.
 */
export const webhooks = pgTable("webhooks", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),

  // Events to trigger on
  events: text("events").array().notNull(),

  // Security - HMAC secret for signature verification
  secret: varchar("secret", { length: 255 }),

  // Status
  enabled: boolean("enabled").notNull().default(true),

  // Tracking
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastStatusCode: integer("last_status_code"),
  failureCount: integer("failure_count").default(0),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Log of webhook delivery attempts for debugging and audit purposes.
 * Stores payload, response, and timing information.
 */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),

    event: varchar("event", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),

    // Response
    statusCode: integer("status_code"),
    responseBody: text("response_body"),

    // Timing
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (table) => [index("idx_webhook_deliveries_webhook_id").on(table.webhookId)]
);

// ============================================================================
// NOTIFICATION CHANNELS
// ============================================================================

/**
 * Supported notification channel types.
 */
export const notificationChannelTypeEnum = [
  "discord",
  "telegram",
  "email",
] as const;
export type NotificationChannelType =
  (typeof notificationChannelTypeEnum)[number];

/**
 * Configuration type definitions for each channel type.
 * Discord: { webhook_url: string }
 * Telegram: { bot_token: string, chat_id: string }
 * Email: { to: string, from: string }
 */
export type DiscordConfig = { webhook_url: string };
export type TelegramConfig = { bot_token: string; chat_id: string };
export type EmailConfig = { to: string; from: string };
export type NotificationConfig = DiscordConfig | TelegramConfig | EmailConfig;

/**
 * Configurable notification channels for real-time alerts.
 * Supports Discord webhooks, Telegram bots, and email via Resend.
 */
export const notificationChannels = pgTable("notification_channels", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  type: varchar("type", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),

  // Type-specific configuration stored as JSONB
  config: jsonb("config").notNull().$type<NotificationConfig>(),

  // Events to notify on
  events: text("events")
    .array()
    .notNull()
    .default(sql`'{"lead.created"}'::text[]`),

  enabled: boolean("enabled").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// SYSTEM SETTINGS
// ============================================================================

/**
 * Key-value store for system settings.
 * Stores configuration like OpenAI API key, Cal.com link, etc.
 */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Admin user for CRM authentication.
 * Currently supports a single admin user; future versions may support multiple.
 */
export const adminUser = pgTable("admin_user", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

/**
 * Admin session management with secure token storage.
 * Tokens are stored as hashes; the actual token is only in the client cookie.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUser.id, { onDelete: "cascade" }),

    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Session metadata
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 45 }),
  },
  (table) => [
    index("idx_sessions_token_hash").on(table.tokenHash),
    index("idx_sessions_expires_at").on(table.expiresAt),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

/**
 * Define Drizzle ORM relations for type-safe joins and nested queries.
 */
export const leadsRelations = relations(leads, ({ many }) => ({
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ many }) => ({
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    webhook: one(webhooks, {
      fields: [webhookDeliveries.webhookId],
      references: [webhooks.id],
    }),
  })
);

export const adminUserRelations = relations(adminUser, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(adminUser, {
    fields: [sessions.userId],
    references: [adminUser.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export type LeadActivity = typeof leadActivities.$inferSelect;
export type NewLeadActivity = typeof leadActivities.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;

export type NotificationChannel = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type AdminUser = typeof adminUser.$inferSelect;
export type NewAdminUser = typeof adminUser.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
