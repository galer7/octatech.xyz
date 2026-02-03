/**
 * Validation schemas for leads and activities.
 *
 * Implements Zod schemas for lead creation, update, and activity creation
 * per specs/02-contact-form.md and specs/07-api-endpoints.md.
 */

import { z } from "zod";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Valid lead status values matching the database constraint.
 * Represents the sales pipeline stages.
 */
export const leadStatusEnum = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadStatusValue = (typeof leadStatusEnum)[number];

/**
 * Valid activity types for lead interactions.
 */
export const activityTypeEnum = [
  "note",
  "email",
  "call",
  "meeting",
  "status_change",
] as const;
export type ActivityTypeValue = (typeof activityTypeEnum)[number];

/**
 * Budget range options from the contact form specification.
 */
export const budgetOptions = [
  "Not sure yet",
  "$5,000 - $15,000",
  "$15,000 - $50,000",
  "$50,000 - $100,000",
  "$100,000+",
] as const;
export type BudgetOption = (typeof budgetOptions)[number];

/**
 * Project type options from the contact form specification.
 */
export const projectTypeOptions = [
  "New Product / MVP",
  "Staff Augmentation",
  "Legacy Modernization",
  "Cloud Migration",
  "Performance Optimization",
  "Security Audit",
  "Other",
] as const;
export type ProjectTypeOption = (typeof projectTypeOptions)[number];

/**
 * Source options for lead attribution.
 */
export const sourceOptions = [
  "Google Search",
  "LinkedIn",
  "Referral",
  "Twitter/X",
  "Conference/Event",
  "API",
  "Cal.com",
  "Other",
] as const;
export type SourceOption = (typeof sourceOptions)[number];

/**
 * Valid sort fields for lead listing.
 */
export const leadSortFields = [
  "createdAt",
  "updatedAt",
  "name",
  "email",
  "company",
  "status",
] as const;
export type LeadSortField = (typeof leadSortFields)[number];

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Email validation with proper format checking.
 */
export const emailSchema = z
  .string()
  .min(1, "Email is required")
  .max(255, "Email must be at most 255 characters")
  .email("Invalid email format");

/**
 * Phone validation with basic format checking.
 * Allows international formats with + prefix, digits, spaces, hyphens, parentheses.
 */
export const phoneSchema = z
  .string()
  .max(50, "Phone must be at most 50 characters")
  .regex(
    /^[+]?[\d\s\-().]+$/,
    "Invalid phone format. Use digits, spaces, hyphens, or parentheses"
  )
  .optional()
  .nullable();

/**
 * Schema for creating a lead via the public API.
 * Used for authenticated API requests with leads:write scope.
 */
export const createLeadSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters"),
  email: emailSchema,
  company: z.string().max(255, "Company must be at most 255 characters").optional().nullable(),
  phone: phoneSchema,
  budget: z.string().max(100, "Budget must be at most 100 characters").optional().nullable(),
  projectType: z.string().max(100, "Project type must be at most 100 characters").optional().nullable(),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be at most 5000 characters"),
  source: z.string().max(100, "Source must be at most 100 characters").optional().nullable(),
  status: z.enum(leadStatusEnum).optional().default("new"),
  notes: z.string().max(10000, "Notes must be at most 10000 characters").optional().nullable(),
  tags: z.array(z.string().max(50, "Tag must be at most 50 characters")).max(20, "Maximum 20 tags allowed").optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

/**
 * Schema for creating a lead from the public contact form.
 * Similar to createLeadSchema but with honeypot field for spam protection.
 */
export const publicLeadSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters"),
  email: emailSchema,
  company: z.string().max(255, "Company must be at most 255 characters").optional().nullable(),
  phone: phoneSchema,
  budget: z.string().max(100, "Budget must be at most 100 characters").optional().nullable(),
  projectType: z.string().max(100, "Project type must be at most 100 characters").optional().nullable(),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be at most 5000 characters"),
  source: z.string().max(100, "Source must be at most 100 characters").optional().nullable(),
  // Honeypot field - must be empty for legitimate submissions
  website: z.string().optional(),
});
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

/**
 * Schema for updating a lead.
 * All fields are optional - only provided fields are updated.
 */
export const updateLeadSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters")
    .optional(),
  email: z
    .string()
    .max(255, "Email must be at most 255 characters")
    .email("Invalid email format")
    .optional(),
  company: z.string().max(255, "Company must be at most 255 characters").optional().nullable(),
  phone: phoneSchema,
  budget: z.string().max(100, "Budget must be at most 100 characters").optional().nullable(),
  projectType: z.string().max(100, "Project type must be at most 100 characters").optional().nullable(),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be at most 5000 characters")
    .optional(),
  source: z.string().max(100, "Source must be at most 100 characters").optional().nullable(),
  status: z.enum(leadStatusEnum).optional(),
  notes: z.string().max(10000, "Notes must be at most 10000 characters").optional().nullable(),
  tags: z.array(z.string().max(50, "Tag must be at most 50 characters")).max(20, "Maximum 20 tags allowed").optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

/**
 * Schema for creating a lead activity.
 */
export const createActivitySchema = z.object({
  type: z.enum(activityTypeEnum, {
    errorMap: () => ({
      message: `Type must be one of: ${activityTypeEnum.join(", ")}`,
    }),
  }),
  description: z
    .string()
    .min(1, "Description is required")
    .max(5000, "Description must be at most 5000 characters"),
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

/**
 * Schema for listing leads with pagination, filtering, and sorting.
 */
export const listLeadsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .positive("Page must be positive")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .positive("Limit must be positive")
    .max(100, "Maximum 100 items per page")
    .default(20),
  status: z.enum(leadStatusEnum).optional(),
  search: z.string().max(100, "Search query must be at most 100 characters").optional(),
  sort: z.string().default("-createdAt"),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

/**
 * Schema for AI lead parsing.
 */
export const parseLeadSchema = z.object({
  text: z
    .string()
    .min(1, "Text is required")
    .max(5000, "Text must be at most 5000 characters"),
  autoSave: z.boolean().optional().default(false),
});
export type ParseLeadInput = z.infer<typeof parseLeadSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse and validate the sort parameter.
 * Returns the field name and direction.
 *
 * @param sort - Sort parameter (e.g., "-createdAt" for descending, "name" for ascending)
 * @returns Object with field and direction
 *
 * @example
 * ```ts
 * parseSortParam("-createdAt"); // { field: "createdAt", direction: "desc" }
 * parseSortParam("name");       // { field: "name", direction: "asc" }
 * ```
 */
export function parseSortParam(sort: string): {
  field: LeadSortField;
  direction: "asc" | "desc";
} {
  const isDescending = sort.startsWith("-");
  const fieldName = isDescending ? sort.slice(1) : sort;

  // Validate and default to createdAt if invalid
  const validField = leadSortFields.includes(fieldName as LeadSortField)
    ? (fieldName as LeadSortField)
    : "createdAt";

  return {
    field: validField,
    direction: isDescending ? "desc" : "asc",
  };
}

/**
 * Convert Zod validation errors to a field-level error map.
 * Used for consistent error response formatting per API spec.
 *
 * @param zodError - Zod error from safeParse
 * @returns Record mapping field names to error messages
 *
 * @example
 * ```ts
 * const result = schema.safeParse(data);
 * if (!result.success) {
 *   const errors = formatZodErrors(result.error);
 *   // { email: "Invalid email format", name: "Name is required" }
 * }
 * ```
 */
export function formatZodErrors(
  zodError: z.ZodError
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of zodError.issues) {
    const field = issue.path.join(".") || "unknown";
    // Only keep the first error for each field
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

/**
 * Check if a honeypot field was filled (spam detection).
 * Returns true if the field is filled (indicates bot/spam).
 *
 * @param value - The honeypot field value
 * @returns true if spam detected
 */
export function isHoneypotFilled(value: string | undefined | null): boolean {
  return value !== undefined && value !== null && value.trim() !== "";
}

/**
 * Validate UUID format.
 *
 * @param id - String to validate
 * @returns true if valid UUID
 */
export function isValidUuid(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}
