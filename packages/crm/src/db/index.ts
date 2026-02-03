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
export { db, sql, closeConnection, checkDatabaseHealth } from "./connection";
export type { Database } from "./connection";

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
} from "./schema";

// Relations
export {
  leadsRelations,
  leadActivitiesRelations,
  webhooksRelations,
  webhookDeliveriesRelations,
  adminUserRelations,
  sessionsRelations,
} from "./schema";

// Enum values
export {
  leadStatusEnum,
  activityTypeEnum,
  apiKeyScopeEnum,
  webhookEventEnum,
  notificationChannelTypeEnum,
} from "./schema";

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
} from "./schema";

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
} from "./schema";
