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

// ============================================================================
// OUTBOUND PIPELINE ENUMS
// ============================================================================

export const contactRelationshipStatusEnum = [
  "identified",
  "first_interaction",
  "engaged",
  "conversation",
  "opportunity",
  "converted",
  "dormant",
] as const;
export type ContactRelationshipStatus = (typeof contactRelationshipStatusEnum)[number];

export const contactWarmthEnum = ["cold", "warm", "hot"] as const;
export type ContactWarmth = (typeof contactWarmthEnum)[number];

export const contactTierEnum = ["A", "B", "C"] as const;
export type ContactTier = (typeof contactTierEnum)[number];

export const contactSourceEnum = [
  "linkedin_search",
  "linkedin_post_engagement",
  "linkedin_comment",
  "referral",
  "event",
  "cold_outreach",
  "inbound_converted",
  "other",
] as const;
export type ContactSource = (typeof contactSourceEnum)[number];

export const companySizeEnum = [
  "solo",
  "startup",
  "small",
  "medium",
  "large",
  "enterprise",
] as const;
export type CompanySize = (typeof companySizeEnum)[number];

export const companyContractTypeEnum = [
  "b2b",
  "employment",
  "both",
  "unknown",
] as const;
export type CompanyContractType = (typeof companyContractTypeEnum)[number];

export const contactInteractionTypeEnum = [
  "linkedin_comment",
  "linkedin_like",
  "linkedin_dm_sent",
  "linkedin_dm_received",
  "linkedin_connection_sent",
  "linkedin_connection_accepted",
  "linkedin_post_engagement",
  "email_sent",
  "email_received",
  "call",
  "meeting",
  "note",
] as const;
export type ContactInteractionType = (typeof contactInteractionTypeEnum)[number];

export const interactionDirectionEnum = ["inbound", "outbound"] as const;
export type InteractionDirection = (typeof interactionDirectionEnum)[number];

export const contentPlatformEnum = [
  "linkedin",
  "blog",
  "devto",
  "twitter",
  "youtube",
  "other",
] as const;
export type ContentPlatform = (typeof contentPlatformEnum)[number];

export const contentEngagementTypeEnum = [
  "like",
  "comment",
  "repost",
  "share",
] as const;
export type ContentEngagementType = (typeof contentEngagementTypeEnum)[number];

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

    // Bridge from leads back to outbound contacts
    contactId: uuid("contact_id"),
  },
  (table) => [
    index("idx_leads_status").on(table.status),
    index("idx_leads_email").on(table.email),
    index("idx_leads_created_at").on(table.createdAt.desc()),
    index("idx_leads_contact_id").on(table.contactId),
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
  "companies:read",
  "companies:write",
  "companies:delete",
  "companies:*",
  "contacts:read",
  "contacts:write",
  "contacts:delete",
  "contacts:*",
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
// OUTBOUND PIPELINE TABLES
// ============================================================================

export const companies = pgTable(
  "companies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    industry: varchar("industry", { length: 255 }),
    size: varchar("size", { length: 50 }),
    location: varchar("location", { length: 255 }),
    website: varchar("website", { length: 500 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    hiringContractors: boolean("hiring_contractors"),
    contractType: varchar("contract_type", { length: 50 }).default("unknown"),
    notes: text("notes"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_companies_name").on(table.name),
    check(
      "valid_company_size",
      sql`${table.size} IS NULL OR ${table.size} IN ('solo', 'startup', 'small', 'medium', 'large', 'enterprise')`
    ),
    check(
      "valid_contract_type",
      sql`${table.contractType} IS NULL OR ${table.contractType} IN ('b2b', 'employment', 'both', 'unknown')`
    ),
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    role: varchar("role", { length: 255 }),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    location: varchar("location", { length: 255 }),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "set null" }),
    source: varchar("source", { length: 100 }),
    relationshipStatus: varchar("relationship_status", { length: 50 })
      .notNull()
      .default("identified"),
    warmth: varchar("warmth", { length: 20 })
      .notNull()
      .default("cold"),
    tier: varchar("tier", { length: 5 }).default("C"),
    nextAction: text("next_action"),
    nextActionDue: timestamp("next_action_due", { withTimezone: true }),
    notes: text("notes"),
    tags: text("tags").array(),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    leadId: uuid("lead_id")
      .references(() => leads.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_contacts_company_id").on(table.companyId),
    index("idx_contacts_relationship_status").on(table.relationshipStatus),
    index("idx_contacts_warmth").on(table.warmth),
    index("idx_contacts_next_action_due").on(table.nextActionDue),
    index("idx_contacts_last_interaction_at").on(table.lastInteractionAt.desc()),
    check(
      "valid_relationship_status",
      sql`${table.relationshipStatus} IN ('identified', 'first_interaction', 'engaged', 'conversation', 'opportunity', 'converted', 'dormant')`
    ),
    check(
      "valid_warmth",
      sql`${table.warmth} IN ('cold', 'warm', 'hot')`
    ),
    check(
      "valid_tier",
      sql`${table.tier} IS NULL OR ${table.tier} IN ('A', 'B', 'C')`
    ),
  ]
);

export const contactInteractions = pgTable(
  "contact_interactions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    direction: varchar("direction", { length: 20 }).notNull().default("outbound"),
    description: text("description").notNull(),
    url: varchar("url", { length: 1000 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_contact_interactions_contact_id").on(table.contactId),
    index("idx_contact_interactions_created_at").on(table.createdAt.desc()),
    check(
      "valid_interaction_type",
      sql`${table.type} IN ('linkedin_comment', 'linkedin_like', 'linkedin_dm_sent', 'linkedin_dm_received', 'linkedin_connection_sent', 'linkedin_connection_accepted', 'linkedin_post_engagement', 'email_sent', 'email_received', 'call', 'meeting', 'note')`
    ),
    check(
      "valid_direction",
      sql`${table.direction} IN ('inbound', 'outbound')`
    ),
  ]
);

export const contentPosts = pgTable(
  "content_posts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    platform: varchar("platform", { length: 50 }).notNull(),
    title: varchar("title", { length: 500 }),
    url: varchar("url", { length: 1000 }),
    body: text("body"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    tags: text("tags").array(),
    likesCount: integer("likes_count").default(0),
    commentsCount: integer("comments_count").default(0),
    repostsCount: integer("reposts_count").default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_content_posts_platform").on(table.platform),
    index("idx_content_posts_published_at").on(table.publishedAt.desc()),
    check(
      "valid_platform",
      sql`${table.platform} IN ('linkedin', 'blog', 'devto', 'twitter', 'youtube', 'other')`
    ),
  ]
);

export const contentEngagements = pgTable(
  "content_engagements",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contentPostId: uuid("content_post_id")
      .notNull()
      .references(() => contentPosts.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .references(() => contacts.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    linkedinUrl: varchar("linkedin_url", { length: 500 }),
    engagementType: varchar("engagement_type", { length: 50 }).notNull(),
    commentText: text("comment_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_content_engagements_post_id").on(table.contentPostId),
    index("idx_content_engagements_contact_id").on(table.contactId),
    check(
      "valid_engagement_type",
      sql`${table.engagementType} IN ('like', 'comment', 'repost', 'share')`
    ),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

/**
 * Define Drizzle ORM relations for type-safe joins and nested queries.
 */
export const leadsRelations = relations(leads, ({ many, one }) => ({
  activities: many(leadActivities),
  contact: one(contacts, {
    fields: [leads.contactId],
    references: [contacts.id],
  }),
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

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, {
    fields: [contacts.companyId],
    references: [companies.id],
  }),
  interactions: many(contactInteractions),
  lead: one(leads, {
    fields: [contacts.leadId],
    references: [leads.id],
  }),
}));

export const contactInteractionsRelations = relations(contactInteractions, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactInteractions.contactId],
    references: [contacts.id],
  }),
}));

export const contentPostsRelations = relations(contentPosts, ({ many }) => ({
  engagements: many(contentEngagements),
}));

export const contentEngagementsRelations = relations(contentEngagements, ({ one }) => ({
  post: one(contentPosts, {
    fields: [contentEngagements.contentPostId],
    references: [contentPosts.id],
  }),
  contact: one(contacts, {
    fields: [contentEngagements.contactId],
    references: [contacts.id],
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

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type ContactInteraction = typeof contactInteractions.$inferSelect;
export type NewContactInteraction = typeof contactInteractions.$inferInsert;

export type ContentPost = typeof contentPosts.$inferSelect;
export type NewContentPost = typeof contentPosts.$inferInsert;

export type ContentEngagement = typeof contentEngagements.$inferSelect;
export type NewContentEngagement = typeof contentEngagements.$inferInsert;
