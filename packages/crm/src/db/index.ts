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

export type { Database } from "./connection.js";
// Database connection and utilities
export { checkDatabaseHealth, closeConnection, db, sql } from "./connection.js";
// Types - Tables
// Types - Enums
export type {
	ActivityType,
	AdminUser,
	ApiKey,
	ApiKeyScope,
	Company,
	CompanyContractType,
	CompanySize,
	Contact,
	ContactInteraction,
	ContactInteractionType,
	ContactRelationshipStatus,
	ContactSource,
	ContactTier,
	ContactWarmth,
	ContentEngagement,
	ContentEngagementType,
	ContentPlatform,
	ContentPost,
	DiscordConfig,
	EmailConfig,
	InteractionDirection,
	Lead,
	LeadActivity,
	LeadStatus,
	NewAdminUser,
	NewApiKey,
	NewCompany,
	NewContact,
	NewContactInteraction,
	NewContentEngagement,
	NewContentPost,
	NewLead,
	NewLeadActivity,
	NewNotificationChannel,
	NewSession,
	NewSetting,
	NewWebhook,
	NewWebhookDelivery,
	NotificationChannel,
	NotificationChannelType,
	NotificationConfig,
	Session,
	Setting,
	TelegramConfig,
	Webhook,
	WebhookDelivery,
	WebhookEvent,
} from "./schema.js";
// Schema tables
// Relations
// Enum values
export {
	activityTypeEnum,
	adminUser,
	adminUserRelations,
	apiKeyScopeEnum,
	apiKeys,
	companies,
	companiesRelations,
	companyContractTypeEnum,
	companySizeEnum,
	contactInteractions,
	contactInteractionsRelations,
	contactInteractionTypeEnum,
	contactRelationshipStatusEnum,
	contactSourceEnum,
	contacts,
	contactsRelations,
	contactTierEnum,
	contactWarmthEnum,
	contentEngagements,
	contentEngagementsRelations,
	contentEngagementTypeEnum,
	contentPlatformEnum,
	contentPosts,
	contentPostsRelations,
	interactionDirectionEnum,
	leadActivities,
	leadActivitiesRelations,
	leadStatusEnum,
	leads,
	leadsRelations,
	notificationChannels,
	notificationChannelTypeEnum,
	sessions,
	sessionsRelations,
	settings,
	webhookDeliveries,
	webhookDeliveriesRelations,
	webhookEventEnum,
	webhooks,
	webhooksRelations,
} from "./schema.js";
