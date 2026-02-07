/**
 * Companies API routes for external integrations.
 *
 * Implements CRUD operations for companies.
 * All routes require API key authentication with appropriate scopes.
 */

import { Hono } from "hono";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import {
  companies,
  contacts,
  type Company,
  type Contact,
} from "../../db/schema.js";
import {
  requireApiKey,
  requireScope,
} from "../../middleware/api-key.js";
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors.js";
import {
  createCompanySchema,
  updateCompanySchema,
  listCompaniesQuerySchema,
  parseCompanySortParam,
  formatZodErrors,
  isValidUuid,
  type CreateCompanyInput,
  type UpdateCompanyInput,
} from "../../lib/validation.js";

/**
 * Companies API routes app instance.
 */
export const companiesApiRoutes = new Hono();

// All routes require API key authentication
companiesApiRoutes.use("*", requireApiKey);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a company for API response.
 * Converts Date objects to ISO strings and formats fields consistently.
 */
function formatCompanyResponse(company: Company, contactCount?: number) {
  return {
    id: company.id,
    name: company.name,
    industry: company.industry,
    size: company.size,
    location: company.location,
    website: company.website,
    linkedinUrl: company.linkedinUrl,
    hiringContractors: company.hiringContractors,
    contractType: company.contractType,
    notes: company.notes,
    tags: company.tags || [],
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    ...(contactCount !== undefined ? { contactCount } : {}),
  };
}

/**
 * Format a contact for API response (used in company detail).
 */
function formatContactResponse(contact: Contact) {
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    role: contact.role,
    linkedinUrl: contact.linkedinUrl,
    location: contact.location,
    companyId: contact.companyId,
    source: contact.source,
    relationshipStatus: contact.relationshipStatus,
    warmth: contact.warmth,
    tier: contact.tier,
    nextAction: contact.nextAction,
    nextActionDue: contact.nextActionDue?.toISOString() || null,
    notes: contact.notes,
    tags: contact.tags || [],
    lastInteractionAt: contact.lastInteractionAt?.toISOString() || null,
    leadId: contact.leadId,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

/**
 * Get a company by ID or throw NotFoundError.
 */
async function getCompanyOrThrow(id: string): Promise<Company> {
  if (!isValidUuid(id)) {
    throw new NotFoundError("Company");
  }

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1);

  if (!company) {
    throw new NotFoundError("Company");
  }

  return company;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/v1/companies
 *
 * List companies with pagination, filtering, and search.
 * Requires companies:read scope.
 *
 * Query Parameters:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 * - search: Search name, industry, location
 * - size: Filter by company size
 * - contractType: Filter by contract type
 * - hiringContractors: Filter by hiring contractors flag
 * - sort: Sort field with optional - prefix for descending
 */
companiesApiRoutes.get("/", requireScope("companies:read"), async (c) => {
  // Parse and validate query parameters
  const query = c.req.query();
  const parseResult = listCompaniesQuerySchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError("Invalid query parameters", formatZodErrors(parseResult.error));
  }

  const { page, limit, search, size, contractType, hiringContractors, sort } = parseResult.data;
  const { field, direction } = parseCompanySortParam(sort);

  // Build WHERE conditions
  const conditions = [];

  // Filter by size
  if (size) {
    conditions.push(eq(companies.size, size));
  }

  // Filter by contract type
  if (contractType) {
    conditions.push(eq(companies.contractType, contractType));
  }

  // Filter by hiring contractors
  if (hiringContractors !== undefined) {
    conditions.push(eq(companies.hiringContractors, hiringContractors));
  }

  // Search by name, industry, or location
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(companies.name, searchPattern),
        ilike(companies.industry, searchPattern),
        ilike(companies.location, searchPattern)
      )
    );
  }

  // Calculate offset
  const offset = (page - 1) * limit;

  // Get total count
  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(companies);

  if (conditions.length > 0) {
    countQuery.where(and(...conditions));
  }

  const [countResult] = await countQuery;
  const total = countResult?.count || 0;

  // Build sort order
  const sortColumn = {
    createdAt: companies.createdAt,
    updatedAt: companies.updatedAt,
    name: companies.name,
  }[field] || companies.createdAt;

  const orderBy = direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  // Get companies with pagination
  let companiesQuery = db
    .select()
    .from(companies)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    companiesQuery = companiesQuery.where(and(...conditions)) as typeof companiesQuery;
  }

  const companiesResult = await companiesQuery;

  // Get contact counts for each company
  const companyIds = companiesResult.map((co) => co.id);
  const contactCounts: Record<string, number> = {};

  if (companyIds.length > 0) {
    const contactCountRows = await db
      .select({
        companyId: contacts.companyId,
        count: sql<number>`count(*)::int`,
      })
      .from(contacts)
      .where(
        sql`${contacts.companyId} IN ${companyIds}`
      )
      .groupBy(contacts.companyId);

    for (const row of contactCountRows) {
      if (row.companyId) {
        contactCounts[row.companyId] = row.count;
      }
    }
  }

  return c.json({
    data: companiesResult.map((company) =>
      formatCompanyResponse(company, contactCounts[company.id] || 0)
    ),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/v1/companies/:id
 *
 * Get a single company by ID with its contacts.
 * Requires companies:read scope.
 */
companiesApiRoutes.get("/:id", requireScope("companies:read"), async (c) => {
  const id = c.req.param("id");
  const company = await getCompanyOrThrow(id);

  // Get company contacts
  const companyContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, id))
    .orderBy(desc(contacts.createdAt));

  return c.json({
    data: {
      ...formatCompanyResponse(company, companyContacts.length),
      contacts: companyContacts.map(formatContactResponse),
    },
  });
});

/**
 * POST /api/v1/companies
 *
 * Create a new company.
 * Requires companies:write scope.
 */
companiesApiRoutes.post("/", requireScope("companies:write"), async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createCompanySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
  }

  const input: CreateCompanyInput = parseResult.data;

  // Insert company
  const [newCompany] = await db
    .insert(companies)
    .values({
      name: input.name,
      industry: input.industry || null,
      size: input.size || null,
      location: input.location || null,
      website: input.website || null,
      linkedinUrl: input.linkedinUrl || null,
      hiringContractors: input.hiringContractors ?? null,
      contractType: input.contractType || "unknown",
      notes: input.notes || null,
      tags: input.tags || null,
    })
    .returning();

  return c.json(
    {
      data: formatCompanyResponse(newCompany, 0),
    },
    201
  );
});

/**
 * PATCH /api/v1/companies/:id
 *
 * Update a company.
 * Requires companies:write scope.
 */
companiesApiRoutes.patch("/:id", requireScope("companies:write"), async (c) => {
  const id = c.req.param("id");
  await getCompanyOrThrow(id);

  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateCompanySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
  }

  const input: UpdateCompanyInput = parseResult.data;

  // Check if there's anything to update
  if (Object.keys(input).length === 0) {
    throw new BadRequestError("At least one field is required for update");
  }

  // Build update object
  const updateData: Partial<typeof companies.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.industry !== undefined) updateData.industry = input.industry;
  if (input.size !== undefined) updateData.size = input.size;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.website !== undefined) updateData.website = input.website;
  if (input.linkedinUrl !== undefined) updateData.linkedinUrl = input.linkedinUrl;
  if (input.hiringContractors !== undefined) updateData.hiringContractors = input.hiringContractors;
  if (input.contractType !== undefined) updateData.contractType = input.contractType;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.tags !== undefined) updateData.tags = input.tags;

  // Update company
  const [updatedCompany] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  // Get contact count
  const [contactCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.companyId, id));

  return c.json({
    data: formatCompanyResponse(updatedCompany, contactCountResult?.count || 0),
  });
});

/**
 * DELETE /api/v1/companies/:id
 *
 * Delete a company.
 * Requires companies:delete scope.
 */
companiesApiRoutes.delete("/:id", requireScope("companies:delete"), async (c) => {
  const id = c.req.param("id");

  // Verify company exists
  await getCompanyOrThrow(id);

  // Delete company (contacts' companyId will be set to null via onDelete: "set null")
  await db.delete(companies).where(eq(companies.id, id));

  return c.json({
    success: true,
    message: "Company deleted",
  });
});
