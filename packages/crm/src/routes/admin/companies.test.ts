/**
 * Tests for admin companies routes.
 *
 * Tests CRUD operations, validation, search, pagination, auth, and CSRF
 * using mocked database and session middleware.
 *
 * These tests verify the companies endpoints work correctly for
 * organizational grouping of outbound contacts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Valid UUIDs for testing
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const CONTACT_UUID = "660e8400-e29b-41d4-a716-446655440001";

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
    size: "size",
    location: "location",
    website: "website",
    linkedinUrl: "linkedin_url",
    hiringContractors: "hiring_contractors",
    contractType: "contract_type",
    notes: "notes",
    tags: "tags",
    createdAt: "created_at",
    updatedAt: "updated_at",
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
}));

// Import after mocking
import { adminCompaniesRoutes } from "./companies";
import { errorHandler } from "../../middleware/error-handler";
import {
  validateSession,
  shouldRefreshSession,
  SESSION_CONFIG,
} from "../../lib/session";
import type { SessionData } from "../../lib/session";
import { db } from "../../db";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
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

function createMockCompany(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: VALID_UUID,
    name: "Test Company",
    industry: "Fintech",
    size: "medium",
    location: "Warsaw, Poland",
    website: "https://example.com",
    linkedinUrl: "https://linkedin.com/company/test",
    hiringContractors: true,
    contractType: "b2b",
    notes: null,
    tags: ["fintech"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockContact(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: CONTACT_UUID,
    name: "John Doe",
    email: "john@test.com",
    phone: null,
    role: "CTO",
    linkedinUrl: null,
    location: null,
    companyId: VALID_UUID,
    source: "linkedin_search",
    relationshipStatus: "engaged",
    warmth: "warm",
    tier: "B",
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

/**
 * Setup database mock to return empty results (default for tests)
 */
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

describe("Admin Companies Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup authenticated session by default
    const mockSession = createMockSession();
    mockValidateSession.mockResolvedValue(mockSession);
    mockShouldRefreshSession.mockReturnValue(false);

    // Setup empty db mock by default
    setupEmptyDbMock();

    // Create app with routes
    app = new Hono();
    app.route("/api/admin/companies", adminCompaniesRoutes);
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

      const res = await app.request("/api/admin/companies");

      expect(res.status).toBe(401);
    });

    it("rejects requests with invalid session", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/companies", {
        headers: { Cookie: "session=invalid-token" },
      });

      expect(res.status).toBe(401);
    });

    it("rejects POST requests without CSRF header", async () => {
      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test Company" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("rejects PATCH requests without CSRF header", async () => {
      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("rejects DELETE requests without CSRF header", async () => {
      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "DELETE",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });
  });

  // ==========================================================================
  // VALIDATION TESTS
  // ==========================================================================

  describe("Validation", () => {
    it("validates required name field on create", async () => {
      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          industry: "Fintech",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("validates empty name on create", async () => {
      const res = await app.request("/api/admin/companies", {
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

    it("validates size enum value on create", async () => {
      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: "Test", size: "gigantic" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("validates contractType enum value on create", async () => {
      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: "Test", contractType: "freelance" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("validates website URL format on create", async () => {
      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: "Test", website: "not-a-url" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("validates LinkedIn URL format on create", async () => {
      const res = await app.request("/api/admin/companies", {
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
    it("returns 404 for invalid UUID format on GET /:id", async () => {
      const res = await app.request("/api/admin/companies/invalid-uuid", {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid UUID format on PATCH /:id", async () => {
      const res = await app.request("/api/admin/companies/invalid-uuid", {
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

    it("returns 404 for invalid UUID format on DELETE /:id", async () => {
      const res = await app.request("/api/admin/companies/invalid-uuid", {
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

  describe("GET /api/admin/companies (list)", () => {
    it("returns empty list with pagination", async () => {
      // count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ count: 0 }]),
      });
      // companies query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const res = await app.request("/api/admin/companies", {
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

    it("returns companies with contactCount", async () => {
      const mockCompany = createMockCompany();

      // count query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ count: 1 }]),
      });
      // companies query with contactCount
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue([
                { ...mockCompany, contactCount: 5 },
              ]),
            }),
          }),
        }),
      });

      const res = await app.request("/api/admin/companies", {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe("Test Company");
      expect(body.data[0].contactCount).toBe(5);
      expect(body.pagination.total).toBe(1);
    });

    it("applies search filter", async () => {
      // When conditions exist, the code does:
      //   countQuery = db.select({count}).from(companies)
      //   countQuery.where(...)  // mutates, doesn't reassign
      //   const [countResult] = await countQuery
      // So the object from .from() needs .where() AND must be awaitable.
      // We use a real Promise and attach .where() to it.
      const countPromise: any = Promise.resolve([{ count: 0 }]);
      countPromise.where = vi.fn();
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue(countPromise),
      });

      // Similarly for companies:
      //   companiesQuery = db.select({}).from().orderBy().limit().offset()
      //   companiesQuery = companiesQuery.where(...) as typeof companiesQuery
      //   const companiesResult = await companiesQuery
      // Here .where() IS reassigned, so .where() must return something awaitable
      const companiesResult: any = Promise.resolve([]);
      const companiesOffset: any = Promise.resolve([]);
      companiesOffset.where = vi.fn().mockReturnValue(companiesResult);
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue(companiesOffset),
            }),
          }),
        }),
      });

      const res = await app.request("/api/admin/companies?search=Fintech", {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it("applies size filter", async () => {
      const countPromise: any = Promise.resolve([{ count: 0 }]);
      countPromise.where = vi.fn();
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue(countPromise),
      });

      const companiesResult: any = Promise.resolve([]);
      const companiesOffset: any = Promise.resolve([]);
      companiesOffset.where = vi.fn().mockReturnValue(companiesResult);
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockReturnValue(companiesOffset),
            }),
          }),
        }),
      });

      const res = await app.request("/api/admin/companies?size=medium", {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(200);
    });

    it("rejects invalid size enum in query", async () => {
      const res = await app.request("/api/admin/companies?size=invalid", {
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

  describe("GET /api/admin/companies/:id (detail)", () => {
    it("returns company with contacts", async () => {
      const mockCompany = createMockCompany();
      const mockContact = createMockContact();

      // getCompanyOrThrow: select().from().where().limit()
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });
      // get contacts: select().from().where().orderBy()
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([mockContact]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(VALID_UUID);
      expect(body.data.name).toBe("Test Company");
      expect(body.data.industry).toBe("Fintech");
      expect(body.data.contacts).toHaveLength(1);
      expect(body.data.contacts[0].name).toBe("John Doe");
      expect(body.data.contacts[0].role).toBe("CTO");
      expect(body.data.contacts[0].warmth).toBe("warm");
    });

    it("returns company with empty contacts", async () => {
      const mockCompany = createMockCompany();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contacts).toHaveLength(0);
    });

    it("returns 404 for non-existent company", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // CRUD TESTS — CREATE
  // ==========================================================================

  describe("POST /api/admin/companies (create)", () => {
    it("creates a company with all fields", async () => {
      const mockCompany = createMockCompany();

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCompany]),
        }),
      });

      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Test Company",
          industry: "Fintech",
          size: "medium",
          location: "Warsaw, Poland",
          website: "https://example.com",
          linkedinUrl: "https://linkedin.com/company/test",
          hiringContractors: true,
          contractType: "b2b",
          tags: ["fintech"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.name).toBe("Test Company");
      expect(body.data.industry).toBe("Fintech");
      expect(body.data.tags).toEqual(["fintech"]);
    });

    it("creates a company with only required name field", async () => {
      const mockCompany = createMockCompany({
        industry: null,
        size: null,
        location: null,
        website: null,
        linkedinUrl: null,
        hiringContractors: null,
      });

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCompany]),
        }),
      });

      const res = await app.request("/api/admin/companies", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: "Minimal Company" }),
      });

      expect(res.status).toBe(201);
    });

    it("handles non-JSON body gracefully", async () => {
      const res = await app.request("/api/admin/companies", {
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

  describe("PATCH /api/admin/companies/:id (update)", () => {
    it("updates company name", async () => {
      const mockCompany = createMockCompany();
      const updatedCompany = createMockCompany({ name: "Updated Company" });

      // getCompanyOrThrow
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });
      // update
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedCompany]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ name: "Updated Company" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Updated Company");
    });

    it("updates multiple fields", async () => {
      const mockCompany = createMockCompany();
      const updatedCompany = createMockCompany({
        name: "Updated",
        industry: "AI",
        size: "large",
      });

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedCompany]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Updated",
          industry: "AI",
          size: "large",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.industry).toBe("AI");
      expect(body.data.size).toBe("large");
    });

    it("rejects empty update body", async () => {
      const mockCompany = createMockCompany();

      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
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

    it("returns 404 for non-existent company", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
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
  });

  // ==========================================================================
  // CRUD TESTS — DELETE
  // ==========================================================================

  describe("DELETE /api/admin/companies/:id (delete)", () => {
    it("deletes a company successfully", async () => {
      const mockCompany = createMockCompany();

      // getCompanyOrThrow
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCompany]),
          }),
        }),
      });
      // delete
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "DELETE",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Company deleted");
    });

    it("returns 404 for non-existent company", async () => {
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await app.request(`/api/admin/companies/${VALID_UUID}`, {
        method: "DELETE",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      expect(res.status).toBe(404);
    });
  });
});
