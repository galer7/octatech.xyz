/**
 * Tests for admin contacts routes.
 *
 * Tests CRUD operations, interactions, auto-upgrade logic, AI parsing,
 * validation, auth, and CSRF using mocked database and session middleware.
 *
 * These tests verify the contacts endpoints work correctly for
 * outbound networking pipeline contacts.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Valid UUIDs for testing
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const COMPANY_UUID = "660e8400-e29b-41d4-a716-446655440001";
const INTERACTION_UUID = "770e8400-e29b-41d4-a716-446655440002";
const _LEAD_UUID = "880e8400-e29b-41d4-a716-446655440003";

// Mock session/auth modules BEFORE imports
vi.mock("../../lib/session", () => ({
	validateSession: vi.fn(),
	refreshSession: vi.fn(),
	shouldRefreshSession: vi.fn(),
	SESSION_CONFIG: {
		defaultDurationMs: 24 * 60 * 60 * 1000,
		rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
		tokenBytes: 32,
		cookieName: "session",
		refreshThresholdMs: 60 * 60 * 1000,
	},
}));

// Mock AI module
vi.mock("../../lib/ai", () => ({
	parseContactText: vi.fn(),
	isOpenAIConfigured: vi.fn(),
}));

// Mock the database
vi.mock("../../db", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
	companies: {
		id: "id",
		name: "name",
		industry: "industry",
	},
	contacts: {
		id: "id",
		name: "name",
		email: "email",
		phone: "phone",
		role: "role",
		linkedinUrl: "linkedin_url",
		location: "location",
		companyId: "company_id",
		source: "source",
		relationshipStatus: "relationship_status",
		warmth: "warmth",
		tier: "tier",
		nextAction: "next_action",
		nextActionDue: "next_action_due",
		notes: "notes",
		tags: "tags",
		lastInteractionAt: "last_interaction_at",
		leadId: "lead_id",
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
	contactInteractions: {
		id: "id",
		contactId: "contact_id",
		type: "type",
		direction: "direction",
		description: "description",
		url: "url",
		createdAt: "created_at",
	},
	leads: {
		id: "id",
		name: "name",
		status: "status",
	},
}));

import { db } from "../../db";
import { isOpenAIConfigured, parseContactText } from "../../lib/ai";
import type { SessionData } from "../../lib/session";
import { SESSION_CONFIG, shouldRefreshSession, validateSession } from "../../lib/session";
import { errorHandler } from "../../middleware/error-handler";
// Import after mocking
import { adminContactsRoutes } from "./contacts";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
const mockParseContactText = parseContactText as ReturnType<typeof vi.fn>;
const mockIsOpenAIConfigured = isOpenAIConfigured as ReturnType<typeof vi.fn>;
const mockDb = db as {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

// ============================================================================
// HELPERS
// ============================================================================

function createMockSession(overrides: Partial<SessionData> = {}): SessionData {
	const now = new Date();
	return {
		sessionId: "sess_test_123",
		userId: "user_test_456",
		user: {
			id: "user_test_456",
			email: "admin@example.com",
		},
		expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		createdAt: now,
		...overrides,
	};
}

function createMockContact(overrides: Record<string, unknown> = {}) {
	const now = new Date();
	return {
		id: VALID_UUID,
		name: "Test Contact",
		email: "test@example.com",
		phone: null,
		role: "CTO",
		linkedinUrl: "https://linkedin.com/in/testcontact",
		location: "Warsaw, Poland",
		companyId: null,
		source: "linkedin_search",
		relationshipStatus: "identified",
		warmth: "cold",
		tier: "C",
		nextAction: null,
		nextActionDue: null,
		notes: null,
		tags: [],
		lastInteractionAt: null,
		leadId: null,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

function createMockInteraction(overrides: Record<string, unknown> = {}) {
	return {
		id: INTERACTION_UUID,
		contactId: VALID_UUID,
		type: "linkedin_comment",
		direction: "outbound",
		description: "Commented on their post about scaling",
		url: "https://linkedin.com/posts/test",
		createdAt: new Date(),
		...overrides,
	};
}

function setupEmptyDbMock() {
	mockDb.select.mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						offset: vi.fn().mockResolvedValue([]),
					}),
				}),
				limit: vi.fn().mockResolvedValue([]),
			}),
			orderBy: vi.fn().mockReturnValue({
				limit: vi.fn().mockReturnValue({
					offset: vi.fn().mockResolvedValue([]),
				}),
			}),
		}),
	});
	mockDb.insert.mockReturnValue({
		values: vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([]),
		}),
	});
	mockDb.update.mockReturnValue({
		set: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([]),
			}),
		}),
	});
	mockDb.delete.mockReturnValue({
		where: vi.fn().mockResolvedValue(undefined),
	});
}

// ============================================================================
// TESTS
// ============================================================================

describe("Admin Contacts Routes", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		setupEmptyDbMock();

		app = new Hono();
		app.route("/api/admin/contacts", adminContactsRoutes);
		app.onError(errorHandler);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	// ==========================================================================
	// AUTHENTICATION TESTS
	// ==========================================================================

	describe("Authentication", () => {
		it("rejects requests without session cookie", async () => {
			mockValidateSession.mockResolvedValue(null);
			const res = await app.request("/api/admin/contacts");
			expect(res.status).toBe(401);
		});

		it("rejects requests with invalid session", async () => {
			mockValidateSession.mockResolvedValue(null);
			const res = await app.request("/api/admin/contacts", {
				headers: { Cookie: "session=invalid-token" },
			});
			expect(res.status).toBe(401);
		});

		it("rejects POST requests without CSRF header", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "Test" }),
			});
			expect(res.status).toBe(401);
		});

		it("rejects PATCH requests without CSRF header", async () => {
			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "Updated" }),
			});
			expect(res.status).toBe(401);
		});

		it("rejects DELETE requests without CSRF header", async () => {
			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "DELETE",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});
			expect(res.status).toBe(401);
		});
	});

	// ==========================================================================
	// VALIDATION TESTS
	// ==========================================================================

	describe("Validation", () => {
		it("validates required name field on create", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ email: "test@test.com" }),
			});
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("validates empty name on create", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "" }),
			});
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("validates warmth enum on create", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Test", warmth: "boiling" }),
			});
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("validates email format on create", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Test", email: "not-an-email" }),
			});
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("validates LinkedIn URL format on create", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Test", linkedinUrl: "not-a-url" }),
			});
			expect(res.status).toBe(400);
		});
	});

	// ==========================================================================
	// INVALID UUID TESTS
	// ==========================================================================

	describe("Invalid UUID handling", () => {
		it("returns 404 for invalid UUID on GET /:id", async () => {
			const res = await app.request("/api/admin/contacts/invalid-uuid", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});
			expect(res.status).toBe(404);
		});

		it("returns 404 for invalid UUID on PATCH /:id", async () => {
			const res = await app.request("/api/admin/contacts/invalid-uuid", {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Updated" }),
			});
			expect(res.status).toBe(404);
		});

		it("returns 404 for invalid UUID on DELETE /:id", async () => {
			const res = await app.request("/api/admin/contacts/invalid-uuid", {
				method: "DELETE",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"X-Requested-With": "XMLHttpRequest",
				},
			});
			expect(res.status).toBe(404);
		});
	});

	// ==========================================================================
	// CRUD TESTS — GET LIST
	// ==========================================================================

	describe("GET /api/admin/contacts (list)", () => {
		it("returns empty list with pagination", async () => {
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([{ count: 0 }]),
			});
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const res = await app.request("/api/admin/contacts", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toEqual([]);
			expect(body.pagination).toEqual({
				page: 1,
				limit: 20,
				total: 0,
				totalPages: 0,
			});
		});

		it("returns contacts with company and interactionCount", async () => {
			const mockContact = createMockContact();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockResolvedValue([{ count: 1 }]),
			});
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([
								{
									...mockContact,
									interactionCount: 3,
									companyJoinId: COMPANY_UUID,
									companyName: "Fintech Co",
								},
							]),
						}),
					}),
				}),
			});

			const res = await app.request("/api/admin/contacts", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toHaveLength(1);
			expect(body.data[0].name).toBe("Test Contact");
			expect(body.data[0].interactionCount).toBe(3);
			expect(body.data[0].company).toEqual({
				id: COMPANY_UUID,
				name: "Fintech Co",
			});
		});

		it("applies warmth filter", async () => {
			const countPromise: any = Promise.resolve([{ count: 0 }]);
			countPromise.where = vi.fn();
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue(countPromise),
			});

			const contactsResult: any = Promise.resolve([]);
			const contactsOffset: any = Promise.resolve([]);
			contactsOffset.where = vi.fn().mockReturnValue(contactsResult);
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockReturnValue(contactsOffset),
						}),
					}),
				}),
			});

			const res = await app.request("/api/admin/contacts?warmth=warm", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});
			expect(res.status).toBe(200);
		});

		it("applies search filter", async () => {
			const countPromise: any = Promise.resolve([{ count: 0 }]);
			countPromise.where = vi.fn();
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue(countPromise),
			});

			const contactsResult: any = Promise.resolve([]);
			const contactsOffset: any = Promise.resolve([]);
			contactsOffset.where = vi.fn().mockReturnValue(contactsResult);
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockReturnValue(contactsOffset),
						}),
					}),
				}),
			});

			const res = await app.request("/api/admin/contacts?search=John", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});
			expect(res.status).toBe(200);
		});

		it("rejects invalid warmth enum in query", async () => {
			const res = await app.request("/api/admin/contacts?warmth=invalid", {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});
			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	// ==========================================================================
	// CRUD TESTS — GET DETAIL
	// ==========================================================================

	describe("GET /api/admin/contacts/:id (detail)", () => {
		it("returns contact with interactions and company", async () => {
			const mockContact = createMockContact({ companyId: COMPANY_UUID });
			const mockInteraction = createMockInteraction();

			// getContactOrThrow
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			// get company
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([{ id: COMPANY_UUID, name: "Fintech Co", industry: "Fintech" }]),
					}),
				}),
			});
			// get interactions
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockResolvedValue([mockInteraction]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.id).toBe(VALID_UUID);
			expect(body.data.name).toBe("Test Contact");
			expect(body.data.company).toEqual({
				id: COMPANY_UUID,
				name: "Fintech Co",
				industry: "Fintech",
			});
			expect(body.data.interactions).toHaveLength(1);
			expect(body.data.interactions[0].type).toBe("linkedin_comment");
		});

		it("returns contact with empty interactions", async () => {
			const mockContact = createMockContact();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			// no company
			// interactions
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockResolvedValue([]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.interactions).toHaveLength(0);
			expect(body.data.company).toBeNull();
		});

		it("returns 404 for non-existent contact", async () => {
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});
			expect(res.status).toBe(404);
		});
	});

	// ==========================================================================
	// CRUD TESTS — CREATE
	// ==========================================================================

	describe("POST /api/admin/contacts (create)", () => {
		it("creates a contact with all fields", async () => {
			const mockContact = createMockContact();

			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockContact]),
				}),
			});

			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					name: "Test Contact",
					email: "test@example.com",
					role: "CTO",
					linkedinUrl: "https://linkedin.com/in/testcontact",
					location: "Warsaw, Poland",
					source: "linkedin_search",
					warmth: "cold",
					tier: "C",
				}),
			});

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.data.name).toBe("Test Contact");
			expect(body.data.role).toBe("CTO");
			expect(body.data.warmth).toBe("cold");
		});

		it("creates a contact with only required name field", async () => {
			const mockContact = createMockContact({
				email: null,
				role: null,
				linkedinUrl: null,
				location: null,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockContact]),
				}),
			});

			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Minimal Contact" }),
			});
			expect(res.status).toBe(201);
		});

		it("handles non-JSON body gracefully", async () => {
			const res = await app.request("/api/admin/contacts", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: "not json",
			});
			expect(res.status).toBe(400);
		});
	});

	// ==========================================================================
	// CRUD TESTS — UPDATE
	// ==========================================================================

	describe("PATCH /api/admin/contacts/:id (update)", () => {
		it("updates contact name", async () => {
			const mockContact = createMockContact();
			const updatedContact = createMockContact({ name: "Updated Contact" });

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updatedContact]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Updated Contact" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.name).toBe("Updated Contact");
		});

		it("updates multiple fields", async () => {
			const mockContact = createMockContact();
			const updatedContact = createMockContact({
				name: "Updated",
				warmth: "warm",
				tier: "A",
			});

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updatedContact]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ name: "Updated", warmth: "warm", tier: "A" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data.warmth).toBe("warm");
			expect(body.data.tier).toBe("A");
		});

		it("creates note interaction on status change", async () => {
			const mockContact = createMockContact({ relationshipStatus: "identified" });
			const updatedContact = createMockContact({
				relationshipStatus: "engaged",
			});

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updatedContact]),
					}),
				}),
			});
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([createMockInteraction({ type: "note" })]),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ relationshipStatus: "engaged" }),
			});

			expect(res.status).toBe(200);
			// Verify insert was called (for the status change note)
			expect(mockDb.insert).toHaveBeenCalled();
		});

		it("rejects empty update body", async () => {
			const mockContact = createMockContact();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("BAD_REQUEST");
		});
	});

	// ==========================================================================
	// CRUD TESTS — DELETE
	// ==========================================================================

	describe("DELETE /api/admin/contacts/:id (delete)", () => {
		it("deletes a contact successfully", async () => {
			const mockContact = createMockContact();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.delete.mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "DELETE",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"X-Requested-With": "XMLHttpRequest",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.message).toBe("Contact deleted");
		});

		it("returns 404 for non-existent contact", async () => {
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}`, {
				method: "DELETE",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"X-Requested-With": "XMLHttpRequest",
				},
			});
			expect(res.status).toBe(404);
		});
	});

	// ==========================================================================
	// INTERACTIONS TESTS
	// ==========================================================================

	describe("POST /api/admin/contacts/:id/interactions (create interaction)", () => {
		it("creates an interaction successfully", async () => {
			const mockContact = createMockContact();
			const mockInteraction = createMockInteraction();

			// getContactOrThrow
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			// insert interaction
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockInteraction]),
				}),
			});
			// getInteractionCount
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ count: 1 }]),
				}),
			});
			// update contact
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}/interactions`, {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					type: "linkedin_comment",
					description: "Commented on their post",
				}),
			});

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body.data.type).toBe("linkedin_comment");
			expect(body.data.direction).toBe("outbound");
		});

		it("auto-upgrades warmth at 3 interactions", async () => {
			const mockContact = createMockContact({ warmth: "cold" });
			const mockInteraction = createMockInteraction();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockInteraction]),
				}),
			});
			// Return count of 3 (threshold for cold->warm)
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ count: 3 }]),
				}),
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}/interactions`, {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					type: "linkedin_like",
					description: "Liked their post",
				}),
			});

			expect(res.status).toBe(201);
			// Verify update was called (for auto-upgrade)
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("auto-upgrades status from identified to first_interaction", async () => {
			const mockContact = createMockContact({
				relationshipStatus: "identified",
			});
			const mockInteraction = createMockInteraction();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			mockDb.insert.mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([mockInteraction]),
				}),
			});
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ count: 1 }]),
				}),
			});
			mockDb.update.mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}/interactions`, {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					type: "linkedin_comment",
					description: "First interaction",
				}),
			});

			expect(res.status).toBe(201);
			expect(mockDb.update).toHaveBeenCalled();
		});

		it("validates interaction type", async () => {
			const mockContact = createMockContact();

			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}/interactions`, {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					type: "invalid_type",
					description: "Test",
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("GET /api/admin/contacts/:id/interactions (list)", () => {
		it("returns paginated interactions", async () => {
			const mockContact = createMockContact();
			const mockInteraction = createMockInteraction();

			// getContactOrThrow
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockContact]),
					}),
				}),
			});
			// count query
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ count: 1 }]),
				}),
			});
			// interactions query
			mockDb.select.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([mockInteraction]),
							}),
						}),
					}),
				}),
			});

			const res = await app.request(`/api/admin/contacts/${VALID_UUID}/interactions`, {
				headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.data).toHaveLength(1);
			expect(body.pagination.total).toBe(1);
		});
	});

	// ==========================================================================
	// AI PARSE TESTS
	// ==========================================================================

	describe("POST /api/admin/contacts/parse (AI parsing)", () => {
		it("returns parsed contact data", async () => {
			mockIsOpenAIConfigured.mockReturnValue(true);
			mockParseContactText.mockResolvedValue({
				parsed: {
					name: "John Doe",
					email: "john@example.com",
					role: "CTO",
					company: "Fintech Co",
					location: "Warsaw, Poland",
					linkedinUrl: null,
				},
				confidence: 0.9,
				extractedFields: ["name", "email", "role", "company", "location"],
			});

			const res = await app.request("/api/admin/contacts/parse", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					text: "John Doe - CTO at Fintech Co, Warsaw, Poland. john@example.com",
				}),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.parsed.name).toBe("John Doe");
			expect(body.parsed.role).toBe("CTO");
			expect(body.confidence).toBe(0.9);
			expect(body.extractedFields).toContain("name");
			expect(body.saved).toBe(false);
		});

		it("rejects empty text", async () => {
			const res = await app.request("/api/admin/contacts/parse", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({ text: "" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});
	});
});
