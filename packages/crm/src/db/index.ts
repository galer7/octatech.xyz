/**
 * Database module exports for the CRM.
 *
 * Re-exports all schema definitions, types, and database utilities
 * for convenient imports throughout the application.
 *
 * @example
 * ```ts
 * import { db, leads, NewLead, LeadStatus } from './db';
 *
 * const newLead: NewLead = {
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   message: 'Interested in your services',
 * };
 *
 * await db.insert(leads).values(newLead);
 * ```
 */

// Database connection and utilities
export { db, sql, closeConnection, checkDatabaseHealth } from "./connection.js";
export type { Database } from "./connection.js";

// Schema tables
export {
  leads,
  leadActivities,
  apiKeys,
  webhooks,
  webhookDeliveries,
  notificationChannels,
  settings,
  adminUser,
  sessions,
  companies,
  contacts,
  contactInteractions,
  contentPosts,
  contentEngagements,
} from "./schema.js";

// Relations
export {
  leadsRelations,
  leadActivitiesRelations,
  webhooksRelations,
  webhookDeliveriesRelations,
  adminUserRelations,
  sessionsRelations,
  companiesRelations,
  contactsRelations,
  contactInteractionsRelations,
  contentPostsRelations,
  contentEngagementsRelations,
} from "./schema.js";

// Enum values
export {
  leadStatusEnum,
  activityTypeEnum,
  apiKeyScopeEnum,
  webhookEventEnum,
  notificationChannelTypeEnum,
  contactRelationshipStatusEnum,
  contactWarmthEnum,
  contactTierEnum,
  contactSourceEnum,
  companySizeEnum,
  companyContractTypeEnum,
  contactInteractionTypeEnum,
  interactionDirectionEnum,
  contentPlatformEnum,
  contentEngagementTypeEnum,
} from "./schema.js";

// Types - Tables
export type {
  Lead,
  NewLead,
  LeadActivity,
  NewLeadActivity,
  ApiKey,
  NewApiKey,
  Webhook,
  NewWebhook,
  WebhookDelivery,
  NewWebhookDelivery,
  NotificationChannel,
  NewNotificationChannel,
  Setting,
  NewSetting,
  AdminUser,
  NewAdminUser,
  Session,
  NewSession,
  Company,
  NewCompany,
  Contact,
  NewContact,
  ContactInteraction,
  NewContactInteraction,
  ContentPost,
  NewContentPost,
  ContentEngagement,
  NewContentEngagement,
} from "./schema.js";

// Types - Enums
export type {
  LeadStatus,
  ActivityType,
  ApiKeyScope,
  WebhookEvent,
  NotificationChannelType,
  NotificationConfig,
  DiscordConfig,
  TelegramConfig,
  EmailConfig,
  ContactRelationshipStatus,
  ContactWarmth,
  ContactTier,
  ContactSource,
  CompanySize,
  CompanyContractType,
  ContactInteractionType,
  InteractionDirection,
  ContentPlatform,
  ContentEngagementType,
} from "./schema.js";
