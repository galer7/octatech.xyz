/**
 * Contacts API routes for external integrations (e.g., Chrome extension).
 *
 * Implements CRUD operations for contacts and interactions.
 * All routes require API key authentication with appropriate scopes.
 */

import { and, asc, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db/connection.js";
import {
	type Contact,
	type ContactInteraction,
	contactInteractions,
	contacts,
} from "../../db/schema.js";
import { BadRequestError, NotFoundError, ValidationError } from "../../lib/errors.js";
import {
	createContactSchema,
	createInteractionSchema,
	formatZodErrors,
	isValidUuid,
	listContactsQuerySchema,
	parseContactSortParam,
	updateContactSchema,
} from "../../lib/validation.js";
import { requireApiKey, requireScope } from "../../middleware/api-key.js";

/**
 * Contacts API routes app instance.
 */
export const contactsApiRoutes = new Hono();

// All routes require API key authentication
contactsApiRoutes.use("*", requireApiKey);

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

	const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);

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
 */
function computeAutoWarmth(currentWarmth: string, interactionCount: number): string {
	const warmthOrder = ["cold", "warm", "hot"];
	const currentIndex = warmthOrder.indexOf(currentWarmth);

	let targetWarmth = currentWarmth;

	if (interactionCount >= 6) {
		targetWarmth = "hot";
	} else if (interactionCount >= 3) {
		targetWarmth = "warm";
	}

	const targetIndex = warmthOrder.indexOf(targetWarmth);
	if (targetIndex > currentIndex) {
		return targetWarmth;
	}

	return currentWarmth;
}

/**
 * Auto-upgrade relationship status based on interaction count.
 */
function computeAutoStatus(currentStatus: string, interactionCount: number): string {
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
 * GET /api/v1/contacts
 *
 * List contacts with pagination, filtering, and search.
 * Requires contacts:read scope.
 */
contactsApiRoutes.get("/", requireScope("contacts:read"), async (c) => {
	const query = c.req.query();
	const parseResult = listContactsQuerySchema.safeParse(query);

	if (!parseResult.success) {
		throw new ValidationError("Invalid query parameters", formatZodErrors(parseResult.error));
	}

	const { page, limit, search, relationshipStatus, warmth, tier, companyId, followUpDue, sort } =
		parseResult.data;
	const { field, direction } = parseContactSortParam(sort);

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
	if (search) {
		const searchPattern = `%${search}%`;
		conditions.push(
			or(
				ilike(contacts.name, searchPattern),
				ilike(contacts.email, searchPattern),
				ilike(contacts.role, searchPattern),
			),
		);
	}

	const offset = (page - 1) * limit;

	const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(contacts);

	if (conditions.length > 0) {
		countQuery.where(and(...conditions));
	}

	const [countResult] = await countQuery;
	const total = countResult?.count || 0;

	const sortColumn =
		{
			createdAt: contacts.createdAt,
			updatedAt: contacts.updatedAt,
			name: contacts.name,
			lastInteractionAt: contacts.lastInteractionAt,
			nextActionDue: contacts.nextActionDue,
		}[field] || contacts.createdAt;

	const orderBy = direction === "desc" ? desc(sortColumn) : asc(sortColumn);

	let contactsQuery = db.select().from(contacts).orderBy(orderBy).limit(limit).offset(offset);

	if (conditions.length > 0) {
		contactsQuery = contactsQuery.where(and(...conditions)) as typeof contactsQuery;
	}

	const contactsResult = await contactsQuery;

	return c.json({
		data: contactsResult.map(formatContactResponse),
		pagination: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	});
});

/**
 * GET /api/v1/contacts/:id
 *
 * Get a single contact with interactions.
 * Requires contacts:read scope.
 */
contactsApiRoutes.get("/:id", requireScope("contacts:read"), async (c) => {
	const id = c.req.param("id");
	const contact = await getContactOrThrow(id);

	const interactions = await db
		.select()
		.from(contactInteractions)
		.where(eq(contactInteractions.contactId, id))
		.orderBy(desc(contactInteractions.createdAt));

	return c.json({
		data: {
			...formatContactResponse(contact),
			interactions: interactions.map(formatInteractionResponse),
		},
	});
});

/**
 * POST /api/v1/contacts
 *
 * Create a new contact.
 * Requires contacts:write scope.
 */
contactsApiRoutes.post("/", requireScope("contacts:write"), async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const parseResult = createContactSchema.safeParse(body);

	if (!parseResult.success) {
		throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
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
		201,
	);
});

/**
 * PATCH /api/v1/contacts/:id
 *
 * Update a contact.
 * Requires contacts:write scope.
 */
contactsApiRoutes.patch("/:id", requireScope("contacts:write"), async (c) => {
	const id = c.req.param("id");
	await getContactOrThrow(id);

	const body = await c.req.json().catch(() => ({}));
	const parseResult = updateContactSchema.safeParse(body);

	if (!parseResult.success) {
		throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
	}

	const input = parseResult.data;

	if (Object.keys(input).length === 0) {
		throw new BadRequestError("At least one field is required for update");
	}

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
		updateData.nextActionDue = input.nextActionDue ? new Date(input.nextActionDue) : null;
	if (input.notes !== undefined) updateData.notes = input.notes;
	if (input.tags !== undefined) updateData.tags = input.tags;

	const [updatedContact] = await db
		.update(contacts)
		.set(updateData)
		.where(eq(contacts.id, id))
		.returning();

	return c.json({
		data: formatContactResponse(updatedContact),
	});
});

/**
 * DELETE /api/v1/contacts/:id
 *
 * Delete a contact.
 * Requires contacts:delete scope.
 */
contactsApiRoutes.delete("/:id", requireScope("contacts:delete"), async (c) => {
	const id = c.req.param("id");
	await getContactOrThrow(id);

	await db.delete(contacts).where(eq(contacts.id, id));

	return c.json({
		success: true,
		message: "Contact deleted",
	});
});

/**
 * POST /api/v1/contacts/:id/interactions
 *
 * Add an interaction to a contact with auto-upgrade side effects.
 * Requires contacts:write scope.
 */
contactsApiRoutes.post("/:id/interactions", requireScope("contacts:write"), async (c) => {
	const id = c.req.param("id");
	const contact = await getContactOrThrow(id);

	const body = await c.req.json().catch(() => ({}));
	const parseResult = createInteractionSchema.safeParse(body);

	if (!parseResult.success) {
		throw new ValidationError("Validation failed", formatZodErrors(parseResult.error));
	}

	const input = parseResult.data;

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

	const interactionCount = await getInteractionCount(id);

	const newWarmth = computeAutoWarmth(contact.warmth, interactionCount);
	const newStatus = computeAutoStatus(contact.relationshipStatus, interactionCount);

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

	await db.update(contacts).set(contactUpdateData).where(eq(contacts.id, id));

	return c.json(
		{
			data: formatInteractionResponse(newInteraction),
		},
		201,
	);
});
