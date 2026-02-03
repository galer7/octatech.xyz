/**
 * TypeScript types for the CRM admin interface.
 * These mirror the backend API response shapes.
 */

// Lead status values
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

// Budget options
export type Budget =
  | 'under_10k'
  | '10k_25k'
  | '25k_50k'
  | '50k_100k'
  | '100k_250k'
  | '250k_plus';

// Project type options
export type ProjectType =
  | 'new_product'
  | 'existing_product'
  | 'maintenance'
  | 'consulting'
  | 'staff_augmentation'
  | 'other';

// Source options
export type LeadSource =
  | 'website'
  | 'referral'
  | 'linkedin'
  | 'google'
  | 'twitter'
  | 'cold_outreach'
  | 'event'
  | 'other';

// Activity types
export type ActivityType = 'note' | 'email' | 'call' | 'meeting' | 'status_change' | 'created';

// User
export interface User {
  id: string;
  email: string;
}

// Lead
export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  budget: Budget | null;
  projectType: ProjectType | null;
  message: string | null;
  source: LeadSource | null;
  status: LeadStatus;
  notes: string | null;
  tags: string[];
  rawInput: string | null;
  aiParsed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Lead activity
export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  description: string;
  oldStatus: LeadStatus | null;
  newStatus: LeadStatus | null;
  createdAt: string;
}

// API Key
export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

// API Key scope
export interface ApiKeyScope {
  scope: string;
  description: string;
}

// Webhook
export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  failureCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Webhook delivery
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  responseBody: string | null;
  durationMs: number | null;
  success: boolean;
  attemptNumber: number;
  nextRetryAt: string | null;
  createdAt: string;
}

// Notification channel types
export type NotificationChannelType = 'discord' | 'telegram' | 'email';

// Notification channel
export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  name: string;
  config: Record<string, string>;
  events: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// AI parse result
export interface ParseResult {
  name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  budget: Budget | null;
  projectType: ProjectType | null;
  message: string | null;
  source: LeadSource | null;
  confidence: number;
  extractedFields: string[];
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Dashboard stats
export interface DashboardStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  recentLeads: Lead[];
}
