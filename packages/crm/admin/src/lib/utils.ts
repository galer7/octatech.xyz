import { clsx, type ClassValue } from 'clsx';

/**
 * Combine class names with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a date string for display
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Format a date with time
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

  return formatDate(date);
}

/**
 * Format budget value for display
 */
export function formatBudget(budget: string | null): string {
  const budgetLabels: Record<string, string> = {
    under_10k: 'Under $10k',
    '10k_25k': '$10k - $25k',
    '25k_50k': '$25k - $50k',
    '50k_100k': '$50k - $100k',
    '100k_250k': '$100k - $250k',
    '250k_plus': '$250k+',
  };
  return budget ? budgetLabels[budget] || budget : 'Not specified';
}

/**
 * Format project type for display
 */
export function formatProjectType(projectType: string | null): string {
  const projectTypeLabels: Record<string, string> = {
    new_product: 'New Product / MVP',
    existing_product: 'Existing Product Enhancement',
    maintenance: 'Maintenance & Support',
    consulting: 'Technical Consulting',
    staff_augmentation: 'Staff Augmentation',
    other: 'Other',
  };
  return projectType ? projectTypeLabels[projectType] || projectType : 'Not specified';
}

/**
 * Format source for display
 */
export function formatSource(source: string | null): string {
  const sourceLabels: Record<string, string> = {
    website: 'Website',
    referral: 'Referral',
    linkedin: 'LinkedIn',
    google: 'Google Search',
    twitter: 'Twitter/X',
    cold_outreach: 'Cold Outreach',
    event: 'Event',
    other: 'Other',
  };
  return source ? sourceLabels[source] || source : 'Unknown';
}

/**
 * Format status for display
 */
export function formatStatus(status: string): string {
  const statusLabels: Record<string, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    proposal: 'Proposal',
    won: 'Won',
    lost: 'Lost',
  };
  return statusLabels[status] || status;
}

/**
 * Get status badge class
 */
export function getStatusClass(status: string): string {
  return `status-${status}`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
