/**
 * Admin contacts routes for the CRM admin UI.
 *
 * These routes provide CRUD operations for contacts (outbound networking pipeline),
 * interaction logging with auto-upgrade logic, and AI-powered contact parsing.
 *
 * All routes require a valid admin session (via requireAuth middleware).
 */

import { Hono } from "hono";
import { eq, and, or, ilike, desc, asc, sql, lte } from "drizzle-orm";
import {
  db,
  companies,
  contacts,
  contactInteractions,
  type Contact,
  type Company,
  type ContactInteraction,
} from "../../db";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth";
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors";
import {
  createContactSchema,
  updateContactSchema,
  listContactsQuerySchema,
  createInteractionSchema,
  listInteractionsQuerySchema,
  parseContactSchema,
  parseContactSortParam,
  formatZodErrors,
  isValidUuid,
} from "../../lib/validation";
import { parseContactText, isOpenAIConfigured } from "../../lib/ai";

/**
 * Admin contacts routes app instance.
 */
export const adminContactsRoutes = new Hono();

// All routes require session authentication
adminContactsRoutes.use("*", requireAuth);

// State-changing routes require CSRF header
adminContactsRoutes.use("*", requireCsrfHeader);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a contact for API response.
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
 * Format an interaction for API response.
 */
function formatInteractionResponse(interaction: ContactInteraction) {
  return {
    id: interaction.id,
    contactId: interaction.contactId,
    type: interaction.type,
    direction: interaction.direction,
    description: interaction.description,
    url: interaction.url,
    createdAt: interaction.createdAt.toISOString(),
  };
}

/**
 * Get a contact by ID or throw NotFoundError.
 */
async function getContactOrThrow(id: string): Promise<Contact> {
  if (!isValidUuid(id)) {
    throw new NotFoundError("Contact");
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);

  if (!contact) {
    throw new NotFoundError("Contact");
  }

  return contact;
}

/**
 * Count interactions for a contact.
 */
async function getInteractionCount(contactId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactInteractions)
    .where(eq(contactInteractions.contactId, contactId));

  return result?.count || 0;
}

/**
 * Auto-upgrade warmth based on interaction count.
 * Only upgrades, never downgrades.
 *
 * Rules:
 * - 1-2 interactions: stay at current warmth (minimum cold)
 * - 3-5 interactions: cold → warm
 * - 6+ interactions: warm → hot
 */
function computeAutoWarmth(
  currentWarmth: string,
  interactionCount: number
): string {
  const warmthOrder = ["cold", "warm", "hot"];
  const currentIndex = warmthOrder.indexOf(currentWarmth);

  let targetWarmth = currentWarmth;

  if (interactionCount >= 6) {
    targetWarmth = "hot";
  } else if (interactionCount >= 3) {
    targetWarmth = "warm";
  }

  // Only upgrade, never downgrade
  const targetIndex = warmthOrder.indexOf(targetWarmth);
  if (targetIndex > currentIndex) {
    return targetWarmth;
  }

  return currentWarmth;
}

/**
 * Auto-upgrade relationship status based on interaction count.
 * Only auto-upgrades from low statuses (identified, first_interaction).
 *
 * Rules:
 * - If identified and first interaction → first_interaction
 * - If first_interaction and 3+ interactions → engaged
 * - Higher statuses require manual change
 */
function computeAutoStatus(
  currentStatus: string,
  interactionCount: number
): string {
  if (currentStatus === "identified" && interactionCount >= 1) {
    return "first_interaction";
  }

  if (currentStatus === "first_interaction" && interactionCount >= 3) {
    return "engaged";
  }

  return currentStatus;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/admin/contacts
 *
 * List contacts with pagination, filtering, search, and follow-up awareness.
 */
adminContactsRoutes.get("/", async (c) => {
  const query = c.req.query();
  const parseResult = listContactsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid query parameters",
      formatZodErrors(parseResult.error)
    );
  }

  const {
    page,
    limit,
    search,
    relationshipStatus,
    warmth,
    tier,
    companyId,
    followUpDue,
    sort,
  } = parseResult.data;
  const { field, direction } = parseContactSortParam(sort);

  // Build WHERE conditions
  const conditions = [];

  if (relationshipStatus) {
    conditions.push(eq(contacts.relationshipStatus, relationshipStatus));
  }

  if (warmth) {
    conditions.push(eq(contacts.warmth, warmth));
  }

  if (tier) {
    conditions.push(eq(contacts.tier, tier));
  }

  if (companyId) {
    conditions.push(eq(contacts.companyId, companyId));
  }

  if (followUpDue) {
    conditions.push(lte(contacts.nextActionDue, new Date()));
  }

  // Search across name, email, role, and company name (via subquery)
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(contacts.name, searchPattern),
        ilike(contacts.email, searchPattern),
        ilike(contacts.role, searchPattern),
        sql`${contacts.companyId} IN (SELECT id FROM companies WHERE name ILIKE ${searchPattern})`
      )
    );
  }

  const offset = (page - 1) * limit;

  // Get total count
  const countQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(contacts);

  if (conditions.length > 0) {
    countQuery.where(and(...conditions));
  }

  const [countResult] = await countQuery;
  const total = countResult?.count || 0;

  // Build sort order
  const sortColumn =
    {
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      name: contacts.name,
      lastInteractionAt: contacts.lastInteractionAt,
      nextActionDue: contacts.nextActionDue,
    }[field] || contacts.createdAt;

  const orderBy = direction === "desc" ? desc(sortColumn) : asc(sortColumn);

  // Interaction count subquery
  const interactionCountSq =
    sql<number>`(SELECT count(*)::int FROM contact_interactions WHERE contact_interactions.contact_id = ${contacts.id})`.as(
      "interactionCount"
    );

  // Company join subqueries
  const companyIdSq =
    sql<string>`(SELECT id FROM companies WHERE companies.id = ${contacts.companyId})`.as(
      "companyJoinId"
    );
  const companyNameSq =
    sql<string>`(SELECT name FROM companies WHERE companies.id = ${contacts.companyId})`.as(
      "companyName"
    );

  // Get contacts with pagination
  let contactsQuery = db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      role: contacts.role,
      linkedinUrl: contacts.linkedinUrl,
      location: contacts.location,
      companyId: contacts.companyId,
      source: contacts.source,
      relationshipStatus: contacts.relationshipStatus,
      warmth: contacts.warmth,
      tier: contacts.tier,
      nextAction: contacts.nextAction,
      nextActionDue: contacts.nextActionDue,
      notes: contacts.notes,
      tags: contacts.tags,
      lastInteractionAt: contacts.lastInteractionAt,
      leadId: contacts.leadId,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      interactionCount: interactionCountSq,
      companyJoinId: companyIdSq,
      companyName: companyNameSq,
    })
    .from(contacts)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  if (conditions.length > 0) {
    contactsQuery = contactsQuery.where(
      and(...conditions)
    ) as typeof contactsQuery;
  }

  const contactsResult = await contactsQuery;

  return c.json({
    data: contactsResult.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      linkedinUrl: row.linkedinUrl,
      location: row.location,
      companyId: row.companyId,
      source: row.source,
      relationshipStatus: row.relationshipStatus,
      warmth: row.warmth,
      tier: row.tier,
      nextAction: row.nextAction,
      nextActionDue: row.nextActionDue?.toISOString() || null,
      notes: row.notes,
      tags: row.tags || [],
      lastInteractionAt: row.lastInteractionAt?.toISOString() || null,
      leadId: row.leadId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      interactionCount: row.interactionCount,
      company: row.companyJoinId
        ? { id: row.companyJoinId, name: row.companyName }
        : null,
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
 * GET /api/admin/contacts/:id
 *
 * Get single contact with interactions timeline, company details, and linked lead.
 */
adminContactsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const contact = await getContactOrThrow(id);

  // Get company details if linked
  let company: { id: string; name: string; industry: string | null } | null =
    null;
  if (contact.companyId) {
    const [companyRow] = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
      })
      .from(companies)
      .where(eq(companies.id, contact.companyId))
      .limit(1);

    if (companyRow) {
      company = companyRow;
    }
  }

  // Get recent interactions (most recent first)
  const interactions = await db
    .select()
    .from(contactInteractions)
    .where(eq(contactInteractions.contactId, id))
    .orderBy(desc(contactInteractions.createdAt));

  // Get linked lead if exists
  let lead: { id: string; name: string; status: string } | null = null;
  if (contact.leadId) {
    const leadsTable = await import("../../db").then((m) => m.leads);
    const [leadRow] = await db
      .select({
        id: leadsTable.id,
        name: leadsTable.name,
        status: leadsTable.status,
      })
      .from(leadsTable)
      .where(eq(leadsTable.id, contact.leadId))
      .limit(1);

    if (leadRow) {
      lead = leadRow;
    }
  }

  return c.json({
    data: {
      ...formatContactResponse(contact),
      company,
      lead,
      interactions: interactions.map(formatInteractionResponse),
    },
  });
});

/**
 * POST /api/admin/contacts
 *
 * Create a new contact.
 */
adminContactsRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createContactSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const input = parseResult.data;

  const [newContact] = await db
    .insert(contacts)
    .values({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      role: input.role || null,
      linkedinUrl: input.linkedinUrl || null,
      location: input.location || null,
      companyId: input.companyId || null,
      source: input.source || "other",
      relationshipStatus: input.relationshipStatus || "identified",
      warmth: input.warmth || "cold",
      tier: input.tier || "C",
      nextAction: input.nextAction || null,
      nextActionDue: input.nextActionDue ? new Date(input.nextActionDue) : null,
      notes: input.notes || null,
      tags: input.tags || null,
    })
    .returning();

  return c.json(
    {
      data: formatContactResponse(newContact),
    },
    201
  );
});

/**
 * PATCH /api/admin/contacts/:id
 *
 * Update contact fields. Auto-creates a note interaction on status change.
 */
adminContactsRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existingContact = await getContactOrThrow(id);

  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateContactSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const input = parseResult.data;

  if (Object.keys(input).length === 0) {
    throw new BadRequestError("At least one field is required for update");
  }

  // Build update object
  const updateData: Partial<typeof contacts.$inferInsert> & {
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.role !== undefined) updateData.role = input.role;
  if (input.linkedinUrl !== undefined) updateData.linkedinUrl = input.linkedinUrl;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.companyId !== undefined) updateData.companyId = input.companyId;
  if (input.source !== undefined) updateData.source = input.source;
  if (input.relationshipStatus !== undefined)
    updateData.relationshipStatus = input.relationshipStatus;
  if (input.warmth !== undefined) updateData.warmth = input.warmth;
  if (input.tier !== undefined) updateData.tier = input.tier;
  if (input.nextAction !== undefined) updateData.nextAction = input.nextAction;
  if (input.nextActionDue !== undefined)
    updateData.nextActionDue = input.nextActionDue
      ? new Date(input.nextActionDue)
      : null;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.tags !== undefined) updateData.tags = input.tags;

  // Update contact
  const [updatedContact] = await db
    .update(contacts)
    .set(updateData)
    .where(eq(contacts.id, id))
    .returning();

  // Auto-create a note interaction when relationship status changes
  if (
    input.relationshipStatus &&
    input.relationshipStatus !== existingContact.relationshipStatus
  ) {
    await db.insert(contactInteractions).values({
      contactId: id,
      type: "note",
      direction: "outbound",
      description: `Status changed from ${existingContact.relationshipStatus} to ${input.relationshipStatus}`,
    });
  }

  return c.json({
    data: formatContactResponse(updatedContact),
  });
});

/**
 * DELETE /api/admin/contacts/:id
 *
 * Delete contact. Cascades interactions. Sets contactId = null on linked leads.
 */
adminContactsRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const contact = await getContactOrThrow(id);

  // If contact is linked to a lead, unlink it
  if (contact.leadId) {
    const leadsTable = await import("../../db").then((m) => m.leads);
    await db
      .update(leadsTable)
      .set({ contactId: null })
      .where(eq(leadsTable.id, contact.leadId));
  }

  // Delete contact (interactions cascade via ON DELETE CASCADE)
  await db.delete(contacts).where(eq(contacts.id, id));

  return c.json({
    success: true,
    message: "Contact deleted",
  });
});

/**
 * POST /api/admin/contacts/:id/interactions
 *
 * Add an interaction to a contact with auto-upgrade side effects.
 */
adminContactsRoutes.post("/:id/interactions", async (c) => {
  const id = c.req.param("id");
  const contact = await getContactOrThrow(id);

  const body = await c.req.json().catch(() => ({}));
  const parseResult = createInteractionSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const input = parseResult.data;

  // Create the interaction
  const [newInteraction] = await db
    .insert(contactInteractions)
    .values({
      contactId: id,
      type: input.type,
      direction: input.direction || "outbound",
      description: input.description,
      url: input.url || null,
    })
    .returning();

  // Get updated interaction count
  const interactionCount = await getInteractionCount(id);

  // Compute auto-upgrades
  const newWarmth = computeAutoWarmth(contact.warmth, interactionCount);
  const newStatus = computeAutoStatus(
    contact.relationshipStatus,
    interactionCount
  );

  // Update contact: lastInteractionAt + any auto-upgrades
  const contactUpdateData: Partial<typeof contacts.$inferInsert> = {
    lastInteractionAt: new Date(),
    updatedAt: new Date(),
  };

  if (newWarmth !== contact.warmth) {
    contactUpdateData.warmth = newWarmth;
  }

  if (newStatus !== contact.relationshipStatus) {
    contactUpdateData.relationshipStatus = newStatus;
  }

  await db
    .update(contacts)
    .set(contactUpdateData)
    .where(eq(contacts.id, id));

  return c.json(
    {
      data: formatInteractionResponse(newInteraction),
    },
    201
  );
});

/**
 * GET /api/admin/contacts/:id/interactions
 *
 * Get interactions for a contact with pagination.
 */
adminContactsRoutes.get("/:id/interactions", async (c) => {
  const id = c.req.param("id");
  await getContactOrThrow(id);

  const query = c.req.query();
  const parseResult = listInteractionsQuerySchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid query parameters",
      formatZodErrors(parseResult.error)
    );
  }

  const { page, limit, type } = parseResult.data;
  const offset = (page - 1) * limit;

  const conditions = [eq(contactInteractions.contactId, id)];

  if (type) {
    conditions.push(eq(contactInteractions.type, type));
  }

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactInteractions)
    .where(and(...conditions));

  const total = countResult?.count || 0;

  // Get interactions
  const interactions = await db
    .select()
    .from(contactInteractions)
    .where(and(...conditions))
    .orderBy(desc(contactInteractions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    data: interactions.map(formatInteractionResponse),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * POST /api/admin/contacts/parse
 *
 * AI-powered contact parsing. Paste LinkedIn profile text or unstructured text
 * to extract structured contact fields.
 */
adminContactsRoutes.post("/parse", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = parseContactSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError(
      "Validation failed",
      formatZodErrors(parseResult.error)
    );
  }

  const { text, autoSave } = parseResult.data;

  if (!isOpenAIConfigured()) {
    throw new BadRequestError(
      "AI parsing not available. OpenAI API key not configured."
    );
  }

  const result = await parseContactText(text);

  // If autoSave is true, create the contact (and optionally find/create company)
  if (autoSave && result.parsed.name) {
    let companyId: string | null = null;

    // Find existing company by name, or skip
    if (result.parsed.company) {
      const [existingCompany] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(ilike(companies.name, result.parsed.company))
        .limit(1);

      if (existingCompany) {
        companyId = existingCompany.id;
      }
    }

    const [newContact] = await db
      .insert(contacts)
      .values({
        name: result.parsed.name,
        email: result.parsed.email || null,
        role: result.parsed.role || null,
        linkedinUrl: result.parsed.linkedinUrl || null,
        location: result.parsed.location || null,
        companyId,
        source: "other",
        relationshipStatus: "identified",
        warmth: "cold",
        tier: "C",
      })
      .returning();

    return c.json({
      parsed: result.parsed,
      confidence: result.confidence,
      extractedFields: result.extractedFields,
      saved: true,
      contact: formatContactResponse(newContact),
    });
  }

  return c.json({
    parsed: result.parsed,
    confidence: result.confidence,
    extractedFields: result.extractedFields,
    saved: false,
  });
});
