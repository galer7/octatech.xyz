/**
 * Leads API routes for external integrations.
 *
 * Implements CRUD operations for leads per specs/07-api-endpoints.md.
 * All routes require API key authentication with appropriate scopes.
 */

import { Hono } from "hono";
import { eq, and, or, ilike, desc, asc, sql, isNull } from "drizzle-orm";
import { db } from "../../db/connection";
import {
  leads,
  leadActivities,
  type Lead,
  type LeadActivity,
} from "../../db/schema";
import {
  requireApiKey,
  requireScope,
  requireApiKeyFromContext,
} from "../../middleware/api-key";
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors";
import {
  createLeadSchema,
  updateLeadSchema,
  createActivitySchema,
  listLeadsQuerySchema,
  parseSortParam,
  formatZodErrors,
  isValidUuid,
  type CreateLeadInput,
  type UpdateLeadInput,
  type CreateActivityInput,
  type ListLeadsQuery,
} from "../../lib/validation";

/**
 * Leads API routes app instance.
 */
export const leadsRoutes = new Hono();

// All routes require API key authentication
leadsRoutes.use("*", requireApiKey);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a lead for API response.
 * Converts Date objects to ISO strings and formats fields consistently.
 */
function formatLeadResponse(lead: Lead) {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    phone: lead.phone,
    budget: lead.budget,
    projectType: lead.projectType,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    notes: lead.notes,
    tags: lead.tags || [],
    rawInput: lead.rawInput,
    aiParsed: lead.aiParsed,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    contactedAt: lead.contactedAt?.toISOString() || null,
  };
}

/**
 * Format an activity for API response.
 */
function formatActivityResponse(activity: LeadActivity) {
  return {
    id: activity.id,
    leadId: activity.leadId,
    type: activity.type,
    description: activity.description,
    oldStatus: activity.oldStatus,
    newStatus: activity.newStatus,
    createdAt: activity.createdAt.toISOString(),
  };
}

/**
 * Get a lead by ID or throw NotFoundError.
 */
async function getLeadOrThrow(id: string): Promise<Lead> {
  if (!isValidUuid(id)) {
    throw new NotFoundError("Lead");
  }

  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);

  if (!lead) {
    throw new NotFoundError("Lead");
  }

  return lead;
}

/**
 * Create a status change activity when lead status changes.
 */
async function logStatusChange(
  leadId: string,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  await db.insert(leadActivities).values({
    leadId,
    type: "status_change",
    description: `Status changed from ${oldStatus} to ${newStatus}`,
    oldStatus,
    newStatus,
  });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/v1/leads
 *
 * List leads with pagination, filtering, and search.
 * Requires leads:read scope.
 *
 * Query Parameters:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 * - status: Filter by status
 * - search: Search name, email, company
 * - sort: Sort field with optional - prefix for descending
 */
leadsRoutes.get("/", requireScope("leads:read"), async (c) => {
  // Parse and validate query parameters
  const query = c.req.query();
  const parseResult = listLeadsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError("Invalid query parameters", formatZodErrors(parseResult.error));
  }

  const { page, limit, status, search, sort } = parseResult.data;
  const { field, direction } = parseSortParam(sort);

  // Build WHERE conditions
  const conditions = [];

  // Filter by status
  if (status) {
    conditions.push(eq(leads.status, status));
  }

  // Search by name, email, or company
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(leads.name, searchPattern),
        ilike(leads.email, searchPattern),
        ilike(leads.company, searchPattern)
      )
    );
  }

  // Calculate offset
  const offset = (page - 1) * limit;

  // Get total count
  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads);

  if (conditions.length > 0) {
    countQuery.where(and(...conditions));
  }

  const [countResult] = await countQuery;
  const total = countResult?.count || 0;

  // Build sort order
  const sortColumn = {
    createdAt: leads.createdAt,
    updatedAt: leads.updatedAt,
    name: leads.name,
    email: leads.email,
    company: leads.company,
    status: leads.status,
  }[field] || leads.createdAt;

  const orderBy = direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  // Get leads with pagination
  let leadsQuery = db
    .select()
    .from(leads)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    leadsQuery = leadsQuery.where(and(...conditions)) as typeof leadsQuery;
  }

  const leadsResult = await leadsQuery;

  return c.json({
    data: leadsResult.map(formatLeadResponse),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/v1/leads/:id
 *
 * Get a single lead by ID with activities.
 * Requires leads:read scope.
 */
leadsRoutes.get("/:id", requireScope("leads:read"), async (c) => {
  const id = c.req.param("id");
  const lead = await getLeadOrThrow(id);

  // Get lead activities
  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, id))
    .orderBy(desc(leadActivities.createdAt));

  return c.json({
    data: {
      ...formatLeadResponse(lead),
      activities: activities.map(formatActivityResponse),
    },
  });
});

/**
 * POST /api/v1/leads
 *
 * Create a new lead.
 * Requires leads:write scope.
 */
leadsRoutes.post("/", requireScope("leads:write"), async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createLeadSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
  }

  const input: CreateLeadInput = parseResult.data;

  // Get API key info for tracking
  const apiKey = requireApiKeyFromContext(c);

  // Set source to API if not provided
  const source = input.source || "API";

  // Insert lead
  const [newLead] = await db
    .insert(leads)
    .values({
      name: input.name,
      email: input.email,
      company: input.company || null,
      phone: input.phone || null,
      budget: input.budget || null,
      projectType: input.projectType || null,
      message: input.message,
      source,
      status: input.status || "new",
      notes: input.notes || null,
      tags: input.tags || null,
    })
    .returning();

  // Create initial activity
  await db.insert(leadActivities).values({
    leadId: newLead.id,
    type: "note",
    description: `Lead created via API (${apiKey.name})`,
  });

  // TODO: Trigger webhooks and notifications (Phase 7 & 8)

  return c.json(
    {
      data: formatLeadResponse(newLead),
    },
    201
  );
});

/**
 * PATCH /api/v1/leads/:id
 *
 * Update a lead.
 * Requires leads:write scope.
 */
leadsRoutes.patch("/:id", requireScope("leads:write"), async (c) => {
  const id = c.req.param("id");
  const existingLead = await getLeadOrThrow(id);

  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateLeadSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
  }

  const input: UpdateLeadInput = parseResult.data;

  // Check if there's anything to update
  if (Object.keys(input).length === 0) {
    throw new BadRequestError("At least one field is required for update");
  }

  // Track status change for activity logging
  const statusChanged =
    input.status !== undefined && input.status !== existingLead.status;
  const oldStatus = existingLead.status;
  const newStatus = input.status;

  // Build update object
  const updateData: Partial<typeof leads.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.company !== undefined) updateData.company = input.company;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.budget !== undefined) updateData.budget = input.budget;
  if (input.projectType !== undefined) updateData.projectType = input.projectType;
  if (input.message !== undefined) updateData.message = input.message;
  if (input.source !== undefined) updateData.source = input.source;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.tags !== undefined) updateData.tags = input.tags;

  // Set contactedAt when status changes to 'contacted' for the first time
  if (
    statusChanged &&
    newStatus === "contacted" &&
    existingLead.contactedAt === null
  ) {
    updateData.contactedAt = new Date();
  }

  // Update lead
  const [updatedLead] = await db
    .update(leads)
    .set(updateData)
    .where(eq(leads.id, id))
    .returning();

  // Log status change as activity
  if (statusChanged && oldStatus && newStatus) {
    await logStatusChange(id, oldStatus, newStatus);
  }

  // TODO: Trigger webhooks for lead.updated / lead.status_changed (Phase 7)

  return c.json({
    data: formatLeadResponse(updatedLead),
  });
});

/**
 * DELETE /api/v1/leads/:id
 *
 * Delete a lead.
 * Requires leads:delete scope.
 */
leadsRoutes.delete("/:id", requireScope("leads:delete"), async (c) => {
  const id = c.req.param("id");

  // Verify lead exists
  await getLeadOrThrow(id);

  // Delete lead (activities cascade automatically)
  await db.delete(leads).where(eq(leads.id, id));

  // TODO: Trigger webhook for lead.deleted (Phase 7)

  return c.json({
    success: true,
    message: "Lead deleted",
  });
});

/**
 * POST /api/v1/leads/:id/activities
 *
 * Add an activity to a lead.
 * Requires leads:write scope.
 */
leadsRoutes.post("/:id/activities", requireScope("leads:write"), async (c) => {
  const id = c.req.param("id");

  // Verify lead exists
  await getLeadOrThrow(id);

  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createActivitySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
  }

  const input: CreateActivityInput = parseResult.data;

  // Insert activity
  const [newActivity] = await db
    .insert(leadActivities)
    .values({
      leadId: id,
      type: input.type,
      description: input.description,
    })
    .returning();

  // Update lead's updatedAt timestamp
  await db
    .update(leads)
    .set({ updatedAt: new Date() })
    .where(eq(leads.id, id));

  // TODO: Trigger webhook for lead.activity_added (Phase 7)

  return c.json(
    {
      data: formatActivityResponse(newActivity),
    },
    201
  );
});

/**
 * GET /api/v1/leads/:id/activities
 *
 * Get activities for a lead.
 * Requires leads:read scope.
 */
leadsRoutes.get("/:id/activities", requireScope("leads:read"), async (c) => {
  const id = c.req.param("id");

  // Verify lead exists
  await getLeadOrThrow(id);

  // Get activities
  const activities = await db
    .select()
    .from(leadActivities)
    .where(eq(leadActivities.leadId, id))
    .orderBy(desc(leadActivities.createdAt));

  return c.json({
    data: activities.map(formatActivityResponse),
  });
});
