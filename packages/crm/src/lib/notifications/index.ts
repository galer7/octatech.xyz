/**
 * Notification System Index.
 *
 * Re-exports all notification-related types, providers, and utilities.
 */

// Discord provider
export {
	DISCORD_CONFIG,
	discordProvider,
	formatDiscordPayload,
	formatLeadCreatedEmbed,
	formatLeadStatusChangedEmbed,
	sendDiscordNotification,
	validateDiscordConfig,
} from "./discord.js";
// Dispatcher
export type { ChannelDispatchResult } from "./dispatcher.js";
export {
	dispatchNotification,
	dispatchNotificationAsync,
	getChannelsForEvent,
	sendTestNotification,
	triggerLeadCreatedNotification,
	triggerLeadStatusChangedNotification,
	validateChannelConfig,
} from "./dispatcher.js";
// Email provider
export {
	EMAIL_CONFIG,
	emailProvider,
	formatEmail,
	formatLeadCreatedEmail,
	formatLeadStatusChangedEmail,
	getResendApiKey,
	sendEmailNotification,
	validateEmailConfig,
} from "./email.js";
// Telegram provider
export {
	escapeHtml,
	formatLeadCreatedMessage,
	formatLeadStatusChangedMessage,
	formatTelegramMessage,
	sendTelegramNotification,
	TELEGRAM_CONFIG,
	telegramProvider,
	validateTelegramConfig,
} from "./telegram.js";
// Types
export type {
	DiscordConfig,
	EmailConfig,
	LeadCreatedNotification,
	LeadStatusChangedNotification,
	NotificationChannelInfo,
	NotificationChannelType,
	NotificationConfig,
	NotificationDeliveryResult,
	NotificationEvent,
	NotificationLeadData,
	NotificationPayload,
	NotificationProvider,
	TelegramConfig,
} from "./types.js";
export {
	getCrmBaseUrl,
	getLeadUrl,
	isDiscordConfig,
	isEmailConfig,
	isTelegramConfig,
	leadToNotificationData,
	notificationEventEnum,
	VALID_NOTIFICATION_EVENTS,
} from "./types.js";
