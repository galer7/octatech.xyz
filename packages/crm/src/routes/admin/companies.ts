/**
 * Admin companies routes for the CRM admin UI.
 *
 * These routes provide CRUD operations for companies with session-based
 * authentication. Companies represent organizations that contacts belong to.
 *
 * All routes require a valid admin session (via requireAuth middleware).
 */

import { Hono } from "hono";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import {
  db,
  companies,
  contacts,
  type Company,
  type Contact,
} from "../../db/index.js";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth.js";
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
} from "../../lib/validation.js";

/**
 * Admin companies routes app instance.
 */
export const adminCompaniesRoutes = new Hono();

// All routes require session authentication
adminCompaniesRoutes.use("*", requireAuth);

// State-changing routes require CSRF header
adminCompaniesRoutes.use("*", requireCsrfHeader);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a company for API response.
 * Converts Date objects to ISO strings and formats fields consistently.
 */
function formatCompanyResponse(company: Company) {
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
  };
}

/**
 * Format a contact for API response.
 * Converts Date objects to ISO strings.
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
 * GET /api/admin/companies
 *
 * List companies with pagination, filtering, and search.
 * Requires session authentication.
 *
 * Query Parameters:
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 * - search: Search name, industry
 * - size: Filter by company size
 * - contractType: Filter by contract type
 * - hiringContractors: Filter by hiring contractors flag
 * - sort: Sort field with optional - prefix for descending
 */
adminCompaniesRoutes.get("/", async (c) => {
  // Parse and validate query parameters
  const query = c.req.query();
  const parseResult = listCompaniesQuerySchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid query parameters",
      formatZodErrors(parseResult.error)
    );
  }

  const { page, limit, search, size, contractType, hiringContractors, sort } =
    parseResult.data;
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

  // Search by name or industry
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(companies.name, searchPattern),
        ilike(companies.industry, searchPattern)
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
  const sortColumn =
    {
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
      name: companies.name,
    }[field] || companies.createdAt;

  const orderBy = direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  // Contact count subquery
  const contactCountSq = sql<number>`(SELECT count(*)::int FROM contacts WHERE contacts.company_id = ${companies.id})`.as(
    "contactCount"
  );

  // Get companies with pagination and contact count
  let companiesQuery = db
    .select({
      id: companies.id,
      name: companies.name,
      industry: companies.industry,
      size: companies.size,
      location: companies.location,
      website: companies.website,
      linkedinUrl: companies.linkedinUrl,
      hiringContractors: companies.hiringContractors,
      contractType: companies.contractType,
      notes: companies.notes,
      tags: companies.tags,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
      contactCount: contactCountSq,
    })
    .from(companies)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    companiesQuery = companiesQuery.where(
      and(...conditions)
    ) as typeof companiesQuery;
  }

  const companiesResult = await companiesQuery;

  return c.json({
    data: companiesResult.map((row) => ({
      ...formatCompanyResponse(row as Company),
      contactCount: row.contactCount,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/admin/companies/:id
 *
 * Get a single company by ID with its contacts.
 * Requires session authentication.
 */
adminCompaniesRoutes.get("/:id", async (c) => {
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
      ...formatCompanyResponse(company),
      contacts: companyContacts.map(formatContactResponse),
    },
  });
});

/**
 * POST /api/admin/companies
 *
 * Create a new company.
 * Requires session authentication.
 */
adminCompaniesRoutes.post("/", async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createCompanySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const input = parseResult.data;

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
      data: formatCompanyResponse(newCompany),
    },
    201
  );
});

/**
 * PATCH /api/admin/companies/:id
 *
 * Update a company.
 * Requires session authentication.
 */
adminCompaniesRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  await getCompanyOrThrow(id);

  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateCompanySchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const input = parseResult.data;

  // Check if there's anything to update
  if (Object.keys(input).length === 0) {
    throw new BadRequestError("At least one field is required for update");
  }

  // Build update object
  const updateData: Partial<typeof companies.$inferInsert> & {
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updateData.name = input.name;
  }
  if (input.industry !== undefined) {
    updateData.industry = input.industry;
  }
  if (input.size !== undefined) {
    updateData.size = input.size;
  }
  if (input.location !== undefined) {
    updateData.location = input.location;
  }
  if (input.website !== undefined) {
    updateData.website = input.website;
  }
  if (input.linkedinUrl !== undefined) {
    updateData.linkedinUrl = input.linkedinUrl;
  }
  if (input.hiringContractors !== undefined) {
    updateData.hiringContractors = input.hiringContractors;
  }
  if (input.contractType !== undefined) {
    updateData.contractType = input.contractType;
  }
  if (input.notes !== undefined) {
    updateData.notes = input.notes;
  }
  if (input.tags !== undefined) {
    updateData.tags = input.tags;
  }

  // Update company
  const [updatedCompany] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  return c.json({
    data: formatCompanyResponse(updatedCompany),
  });
});

/**
 * DELETE /api/admin/companies/:id
 *
 * Delete a company.
 * Contacts will have companyId set to null via ON DELETE SET NULL.
 * Requires session authentication.
 */
adminCompaniesRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");

  // Verify company exists
  await getCompanyOrThrow(id);

  // Delete company (contacts will have companyId set null via ON DELETE SET NULL)
  await db.delete(companies).where(eq(companies.id, id));

  return c.json({
    success: true,
    message: "Company deleted",
  });
});
