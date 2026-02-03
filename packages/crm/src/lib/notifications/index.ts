/**
 * Notification System Index.
 *
 * Re-exports all notification-related types, providers, and utilities.
 */

// Types
export type {
  NotificationChannelType,
  DiscordConfig,
  TelegramConfig,
  EmailConfig,
  NotificationConfig,
  NotificationEvent,
  NotificationLeadData,
  LeadCreatedNotification,
  LeadStatusChangedNotification,
  NotificationPayload,
  NotificationDeliveryResult,
  NotificationChannelInfo,
  NotificationProvider,
} from "./types";

export {
  notificationEventEnum,
  VALID_NOTIFICATION_EVENTS,
  leadToNotificationData,
  getCrmBaseUrl,
  getLeadUrl,
  isDiscordConfig,
  isTelegramConfig,
  isEmailConfig,
} from "./types";

// Discord provider
export {
  discordProvider,
  sendDiscordNotification,
  validateDiscordConfig,
  formatDiscordPayload,
  formatLeadCreatedEmbed,
  formatLeadStatusChangedEmbed,
  DISCORD_CONFIG,
} from "./discord";

// Telegram provider
export {
  telegramProvider,
  sendTelegramNotification,
  validateTelegramConfig,
  formatTelegramMessage,
  formatLeadCreatedMessage,
  formatLeadStatusChangedMessage,
  escapeHtml,
  TELEGRAM_CONFIG,
} from "./telegram";

// Email provider
export {
  emailProvider,
  sendEmailNotification,
  validateEmailConfig,
  formatEmail,
  formatLeadCreatedEmail,
  formatLeadStatusChangedEmail,
  getResendApiKey,
  EMAIL_CONFIG,
} from "./email";

// Dispatcher
export type { ChannelDispatchResult } from "./dispatcher";

export {
  dispatchNotification,
  dispatchNotificationAsync,
  getChannelsForEvent,
  triggerLeadCreatedNotification,
  triggerLeadStatusChangedNotification,
  sendTestNotification,
  validateChannelConfig,
} from "./dispatcher";
