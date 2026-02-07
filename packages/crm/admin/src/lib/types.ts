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

// Company size options
export type CompanySize = 'solo' | 'startup' | 'small' | 'medium' | 'large' | 'enterprise';

// Company contract type
export type CompanyContractType = 'b2b' | 'employment' | 'both' | 'unknown';

// Company
export interface Company {
  id: string;
  name: string;
  industry: string | null;
  size: CompanySize | null;
  location: string | null;
  website: string | null;
  linkedinUrl: string | null;
  hiringContractors: boolean | null;
  contractType: CompanyContractType | null;
  notes: string | null;
  tags: string[];
  contactCount?: number;
  createdAt: string;
  updatedAt: string;
}

// Company with contacts (for detail page)
export interface CompanyWithContacts extends Company {
  contacts: CompanyContact[];
}

// Contact summary for company detail
export interface CompanyContact {
  id: string;
  name: string;
  role: string | null;
  warmth: string;
  relationshipStatus: string;
  lastInteractionAt: string | null;
}

// Dashboard stats
export interface DashboardStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  recentLeads: Lead[];
}

// ============================================================================
// CONTACTS
// ============================================================================

// Contact relationship status
export type ContactRelationshipStatus =
  | 'identified'
  | 'first_interaction'
  | 'engaged'
  | 'conversation'
  | 'opportunity'
  | 'converted'
  | 'dormant';

// Contact warmth
export type ContactWarmth = 'cold' | 'warm' | 'hot';

// Contact tier
export type ContactTier = 'A' | 'B' | 'C';

// Contact source
export type ContactSource =
  | 'linkedin_search'
  | 'linkedin_post_engagement'
  | 'linkedin_comment'
  | 'referral'
  | 'event'
  | 'cold_outreach'
  | 'inbound_converted'
  | 'other';

// Contact interaction type
export type ContactInteractionType =
  | 'linkedin_comment'
  | 'linkedin_like'
  | 'linkedin_dm_sent'
  | 'linkedin_dm_received'
  | 'linkedin_connection_sent'
  | 'linkedin_connection_accepted'
  | 'linkedin_post_engagement'
  | 'email_sent'
  | 'email_received'
  | 'call'
  | 'meeting'
  | 'note';

// Interaction direction
export type InteractionDirection = 'inbound' | 'outbound';

// Contact
export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  linkedinUrl: string | null;
  location: string | null;
  companyId: string | null;
  source: ContactSource | null;
  relationshipStatus: ContactRelationshipStatus;
  warmth: ContactWarmth;
  tier: ContactTier | null;
  nextAction: string | null;
  nextActionDue: string | null;
  notes: string | null;
  tags: string[];
  lastInteractionAt: string | null;
  leadId: string | null;
  interactionCount?: number;
  company?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// Contact with full details (for detail page)
export interface ContactWithDetails extends Contact {
  company: { id: string; name: string; industry: string | null } | null;
  lead: { id: string; name: string; status: string } | null;
  interactions: ContactInteraction[];
}

// Contact interaction
export interface ContactInteraction {
  id: string;
  contactId: string;
  type: ContactInteractionType;
  direction: InteractionDirection;
  description: string;
  url: string | null;
  createdAt: string;
}

// Contact AI parse result
export interface ContactParseResult {
  parsed: {
    name: string | null;
    email: string | null;
    role: string | null;
    company: string | null;
    location: string | null;
    linkedinUrl: string | null;
  };
  confidence: number;
  extractedFields: string[];
  saved?: boolean;
  contact?: Contact;
}
