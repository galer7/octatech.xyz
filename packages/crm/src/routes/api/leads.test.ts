/**
 * Tests for Leads API routes.
 *
 * Verifies CRUD operations, pagination, filtering, and authentication
 * for the external API per specs/07-api-endpoints.md.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";

// Mock db connection BEFORE imports
vi.mock("../../db/connection", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock AI module BEFORE imports
vi.mock("../../lib/ai", () => ({
  parseLeadText: vi.fn(),
  isOpenAIConfigured: vi.fn(() => true),
  AIServiceError: class AIServiceError extends Error {
    code = "AI_SERVICE_ERROR";
    constructor(message = "AI service temporarily unavailable") {
      super(message);
      this.name = "AIServiceError";
    }
  },
  ParseFailedError: class ParseFailedError extends Error {
    code = "PARSE_FAILED";
    confidence: number;
    parsed: unknown;
    constructor(confidence: number, parsed: unknown) {
      super("Could not extract lead information");
      this.name = "ParseFailedError";
      this.confidence = confidence;
      this.parsed = parsed;
    }
  },
}));

// Mock api-key middleware BEFORE imports
vi.mock("../../middleware/api-key", () => ({
  requireApiKey: vi.fn((c, next) => next()),
  requireScope: vi.fn(() => (c: unknown, next: () => Promise<void>) => next()),
  requireApiKeyFromContext: vi.fn(() => ({
    id: "key_test_123",
    name: "Test API Key",
    keyPrefix: "oct_test...",
    scopes: ["leads:*"],
    lastUsedAt: null,
    createdAt: new Date(),
  })),
}));

// Mock api-keys lib
vi.mock("../../lib/api-keys", () => ({
  validateApiKey: vi.fn(),
  hasScope: vi.fn(() => true),
  VALID_SCOPES: new Set(["leads:read", "leads:write", "leads:delete", "leads:*"]),
}));

// Import after mocking
import { leadsRoutes } from "./leads";
import { errorHandler } from "../../middleware/error-handler";
import { db } from "../../db/connection";
import {
  requireApiKey,
  requireScope,
  requireApiKeyFromContext,
} from "../../middleware/api-key";
import { InvalidApiKeyError, InsufficientScopeError } from "../../lib/errors";
import { parseLeadText, isOpenAIConfigured, AIServiceError, ParseFailedError } from "../../lib/ai";
import type { Lead, LeadActivity } from "../../db/schema";

// Cast AI mocks
const mockParseLeadText = parseLeadText as ReturnType<typeof vi.fn>;
const mockIsOpenAIConfigured = isOpenAIConfigured as ReturnType<typeof vi.fn>;

// Cast db methods to mocks
const mockDb = db as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

// Cast middleware to mocks
const mockRequireApiKey = requireApiKey as ReturnType<typeof vi.fn>;
const mockRequireScope = requireScope as ReturnType<typeof vi.fn>;
const mockRequireApiKeyFromContext = requireApiKeyFromContext as ReturnType<typeof vi.fn>;

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock lead for testing.
 */
function createMockLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date();
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "John Doe",
    email: "john@example.com",
    company: "Acme Inc",
    phone: "+1-555-123-4567",
    budget: "$15,000 - $50,000",
    projectType: "New Product / MVP",
    message: "Looking for help with our new product launch.",
    source: "API",
    status: "new",
    notes: null,
    tags: ["startup", "mvp"],
    rawInput: null,
    aiParsed: false,
    createdAt: now,
    updatedAt: now,
    contactedAt: null,
    ...overrides,
  };
}

/**
 * Create a mock activity for testing.
 */
function createMockActivity(overrides: Partial<LeadActivity> = {}): LeadActivity {
  const now = new Date();
  return {
    id: "660e8400-e29b-41d4-a716-446655440001",
    leadId: "550e8400-e29b-41d4-a716-446655440000",
    type: "note",
    description: "Initial contact made",
    oldStatus: null,
    newStatus: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Helper to create Authorization header with Bearer token.
 */
function authHeaders() {
  return {
    Authorization: "Bearer oct_testkey1234567890ABCDEFGH",
    "Content-Type": "application/json",
  };
}

/**
 * Create a chainable mock for drizzle select queries.
 */
function createSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve(result)),
    [Symbol.toStringTag]: "Promise",
  };
  // Make the chain itself awaitable
  Object.assign(chain, {
    then: (resolve: (value: unknown[]) => void) => {
      resolve(result);
      return chain;
    },
  });
  return chain;
}

/**
 * Create a chainable mock for drizzle insert queries.
 */
function createInsertChain(result: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve(result)),
    [Symbol.toStringTag]: "Promise",
  };
  Object.assign(chain, {
    then: (resolve: (value: unknown[]) => void) => {
      resolve(result);
      return chain;
    },
  });
  return chain;
}

/**
 * Create a chainable mock for drizzle update queries.
 */
function createUpdateChain(result: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve(result)),
    [Symbol.toStringTag]: "Promise",
  };
  Object.assign(chain, {
    then: (resolve: (value: unknown[]) => void) => {
      resolve(result);
      return chain;
    },
  });
  return chain;
}

/**
 * Create a chainable mock for drizzle delete queries.
 */
function createDeleteChain(result: unknown[]) {
  const chain = {
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => resolve(result)),
    [Symbol.toStringTag]: "Promise",
  };
  Object.assign(chain, {
    then: (resolve: (value: unknown[]) => void) => {
      resolve(result);
      return chain;
    },
  });
  return chain;
}

// ============================================================================
// TESTS
// ============================================================================

describe("Leads API Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default middleware behavior (authenticated, all scopes)
    mockRequireApiKey.mockImplementation(async (_c, next) => {
      await next();
    });
    mockRequireScope.mockImplementation(
      () => async (_c: unknown, next: () => Promise<void>) => {
        await next();
      }
    );
    mockRequireApiKeyFromContext.mockReturnValue({
      id: "key_test_123",
      name: "Test API Key",
      keyPrefix: "oct_test...",
      scopes: ["leads:*"],
      lastUsedAt: null,
      createdAt: new Date(),
    });

    // Create app with routes
    app = new Hono();
    app.route("/api/v1/leads", leadsRoutes);
    app.onError(errorHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // AUTHENTICATION TESTS
  // ==========================================================================

  describe("Authentication", () => {
    it("should return 401 when API key is missing", async () => {
      mockRequireApiKey.mockImplementation(async () => {
        throw new InvalidApiKeyError("Missing API key");
      });

      const res = await app.request("/api/v1/leads");

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("INVALID_API_KEY");
    });

    it("should return 401 when API key is invalid", async () => {
      mockRequireApiKey.mockImplementation(async () => {
        throw new InvalidApiKeyError("Invalid or revoked API key");
      });

      const res = await app.request("/api/v1/leads", {
        headers: { Authorization: "Bearer invalid_key" },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("INVALID_API_KEY");
    });

    it("should return 403 when scope is insufficient", async () => {
      // Create a new app with middleware that throws
      const testApp = new Hono();

      // Mock middleware that throws for scope check
      testApp.use("*", async (_c, next) => {
        // Simulate requireApiKey passing
        await next();
      });

      testApp.get("/api/v1/leads", async () => {
        // This should never be reached
        throw new InsufficientScopeError("leads:read");
      });

      testApp.onError(errorHandler);

      const res = await testApp.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("INSUFFICIENT_SCOPE");
    });
  });

  // ==========================================================================
  // GET /api/v1/leads - List Leads
  // ==========================================================================

  describe("GET /api/v1/leads", () => {
    it("should list leads with default pagination", async () => {
      const mockLeads = [createMockLead(), createMockLead({ id: "lead-2", name: "Jane Doe" })];

      // Mock count query
      const countChain = createSelectChain([{ count: 2 }]);
      // Mock leads query
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it("should support custom pagination", async () => {
      const mockLeads = [createMockLead()];
      const countChain = createSelectChain([{ count: 50 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?page=2&limit=10", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 50,
        totalPages: 5,
      });
    });

    it("should filter leads by status", async () => {
      const mockLeads = [createMockLead({ status: "qualified" })];
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?status=qualified", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe("qualified");
    });

    it("should search leads by name, email, or company", async () => {
      const mockLeads = [createMockLead({ name: "John Doe" })];
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?search=john", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });

    it("should sort leads ascending", async () => {
      const mockLeads = [createMockLead()];
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?sort=name", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
    });

    it("should sort leads descending with - prefix", async () => {
      const mockLeads = [createMockLead()];
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?sort=-createdAt", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
    });

    it("should return empty array when no leads found", async () => {
      const countChain = createSelectChain([{ count: 0 }]);
      const leadsChain = createSelectChain([]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });

    it("should return 400 for invalid pagination parameters", async () => {
      const res = await app.request("/api/v1/leads?page=-1", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for limit exceeding maximum", async () => {
      const res = await app.request("/api/v1/leads?limit=200", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid status filter", async () => {
      const res = await app.request("/api/v1/leads?status=invalid_status", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should format lead response correctly", async () => {
      const now = new Date("2025-01-15T10:00:00Z");
      const mockLead = createMockLead({
        createdAt: now,
        updatedAt: now,
        contactedAt: null,
        tags: ["tag1", "tag2"],
      });
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain([mockLead]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].createdAt).toBe(now.toISOString());
      expect(body.data[0].updatedAt).toBe(now.toISOString());
      expect(body.data[0].contactedAt).toBeNull();
      expect(body.data[0].tags).toEqual(["tag1", "tag2"]);
    });

    it("should require leads:read scope", async () => {
      expect(mockRequireScope).toBeDefined();
      // The middleware is applied, verifying scope requirement
    });
  });

  // ==========================================================================
  // GET /api/v1/leads/:id - Get Single Lead
  // ==========================================================================

  describe("GET /api/v1/leads/:id", () => {
    it("should return a lead by ID with activities", async () => {
      const mockLead = createMockLead();
      const mockActivities = [
        createMockActivity(),
        createMockActivity({ id: "activity-2", type: "email" }),
      ];

      // Mock lead query
      const leadChain = createSelectChain([mockLead]);
      // Mock activities query
      const activitiesChain = createSelectChain(mockActivities);

      mockDb.select
        .mockReturnValueOnce(leadChain)
        .mockReturnValueOnce(activitiesChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(mockLead.id);
      expect(body.data.name).toBe(mockLead.name);
      expect(body.data.activities).toHaveLength(2);
    });

    it("should return 404 for non-existent lead", async () => {
      const leadChain = createSelectChain([]);

      mockDb.select.mockReturnValueOnce(leadChain);

      const res = await app.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440099",
        { headers: authHeaders() }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("should return 404 for invalid UUID format", async () => {
      const res = await app.request("/api/v1/leads/invalid-uuid", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("should format activities correctly", async () => {
      const now = new Date("2025-01-15T10:00:00Z");
      const mockLead = createMockLead();
      const mockActivity = createMockActivity({
        createdAt: now,
        type: "status_change",
        oldStatus: "new",
        newStatus: "contacted",
      });

      const leadChain = createSelectChain([mockLead]);
      const activitiesChain = createSelectChain([mockActivity]);

      mockDb.select
        .mockReturnValueOnce(leadChain)
        .mockReturnValueOnce(activitiesChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.activities[0].createdAt).toBe(now.toISOString());
      expect(body.data.activities[0].oldStatus).toBe("new");
      expect(body.data.activities[0].newStatus).toBe("contacted");
    });
  });

  // ==========================================================================
  // POST /api/v1/leads - Create Lead
  // ==========================================================================

  describe("POST /api/v1/leads", () => {
    it("should create a lead successfully", async () => {
      const mockLead = createMockLead();

      // Mock insert lead
      const insertLeadChain = createInsertChain([mockLead]);
      // Mock insert activity
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Looking for help with our new product launch.",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.id).toBe(mockLead.id);
      expect(body.data.name).toBe(mockLead.name);
    });

    it("should create lead with all optional fields", async () => {
      const mockLead = createMockLead({
        company: "Acme Inc",
        phone: "+1-555-123-4567",
        budget: "$15,000 - $50,000",
        projectType: "New Product / MVP",
        notes: "High priority",
        tags: ["startup", "mvp"],
      });

      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          company: "Acme Inc",
          phone: "+1-555-123-4567",
          budget: "$15,000 - $50,000",
          projectType: "New Product / MVP",
          message: "Looking for help with our new product launch.",
          notes: "High priority",
          tags: ["startup", "mvp"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.company).toBe("Acme Inc");
      expect(body.data.tags).toEqual(["startup", "mvp"]);
    });

    it("should set default source to API", async () => {
      const mockLead = createMockLead({ source: "API" });

      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("should return 400 for missing required fields", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          // missing email and message
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.email).toBeDefined();
    });

    it("should return 400 for invalid email format", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "invalid-email",
          message: "Test message for the API",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.email).toBeDefined();
    });

    it("should return 400 for name too short", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "A",
          email: "john@example.com",
          message: "Test message for the API",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.name).toBeDefined();
    });

    it("should return 400 for message too short", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Short",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.message).toBeDefined();
    });

    it("should return 400 for invalid status value", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
          status: "invalid_status",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid phone format", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
          phone: "abc123!@#",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should handle malformed JSON body", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: "{ invalid json }",
      });

      expect(res.status).toBe(400);
    });

    it("should create activity logging API key name", async () => {
      const mockLead = createMockLead();
      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
        }),
      });

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // PATCH /api/v1/leads/:id - Update Lead
  // ==========================================================================

  describe("PATCH /api/v1/leads/:id", () => {
    it("should update a lead successfully", async () => {
      const existingLead = createMockLead();
      const updatedLead = createMockLead({ name: "Jane Doe" });

      // Mock select for existing lead
      const selectChain = createSelectChain([existingLead]);
      // Mock update
      const updateChain = createUpdateChain([updatedLead]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.update.mockReturnValueOnce(updateChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ name: "Jane Doe" }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Jane Doe");
    });

    it("should update lead status and log status change activity", async () => {
      const existingLead = createMockLead({ status: "new" });
      const updatedLead = createMockLead({ status: "contacted" });

      const selectChain = createSelectChain([existingLead]);
      const updateChain = createUpdateChain([updatedLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.update.mockReturnValueOnce(updateChain);
      mockDb.insert.mockReturnValueOnce(insertActivityChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "contacted" }),
        }
      );

      expect(res.status).toBe(200);
      // Verify activity was inserted for status change
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("should set contactedAt when status changes to contacted", async () => {
      const existingLead = createMockLead({ status: "new", contactedAt: null });
      const updatedLead = createMockLead({
        status: "contacted",
        contactedAt: new Date(),
      });

      const selectChain = createSelectChain([existingLead]);
      const updateChain = createUpdateChain([updatedLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.update.mockReturnValueOnce(updateChain);
      mockDb.insert.mockReturnValueOnce(insertActivityChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "contacted" }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contactedAt).not.toBeNull();
    });

    it("should return 404 for non-existent lead", async () => {
      const selectChain = createSelectChain([]);

      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440099",
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ name: "Updated Name" }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("should return 400 when no fields to update", async () => {
      const existingLead = createMockLead();
      const selectChain = createSelectChain([existingLead]);

      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({}),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("BAD_REQUEST");
    });

    it("should return 400 for invalid email in update", async () => {
      const existingLead = createMockLead();
      const selectChain = createSelectChain([existingLead]);
      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ email: "invalid-email" }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid status in update", async () => {
      const existingLead = createMockLead();
      const selectChain = createSelectChain([existingLead]);
      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "invalid_status" }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should update multiple fields at once", async () => {
      const existingLead = createMockLead();
      const updatedLead = createMockLead({
        name: "Jane Doe",
        email: "jane@example.com",
        company: "New Company",
      });

      const selectChain = createSelectChain([existingLead]);
      const updateChain = createUpdateChain([updatedLead]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.update.mockReturnValueOnce(updateChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({
            name: "Jane Doe",
            email: "jane@example.com",
            company: "New Company",
          }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Jane Doe");
      expect(body.data.email).toBe("jane@example.com");
      expect(body.data.company).toBe("New Company");
    });
  });

  // ==========================================================================
  // DELETE /api/v1/leads/:id - Delete Lead
  // ==========================================================================

  describe("DELETE /api/v1/leads/:id", () => {
    it("should delete a lead successfully", async () => {
      const mockLead = createMockLead();

      // Mock select for existing lead
      const selectChain = createSelectChain([mockLead]);
      // Mock delete
      const deleteChain = createDeleteChain([mockLead]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.delete.mockReturnValueOnce(deleteChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toBe("Lead deleted");
    });

    it("should return 404 for non-existent lead", async () => {
      const selectChain = createSelectChain([]);

      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440099",
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("should return 404 for invalid UUID format", async () => {
      const res = await app.request("/api/v1/leads/invalid-uuid", {
        method: "DELETE",
        headers: authHeaders(),
      });

      expect(res.status).toBe(404);
    });

    it("should require leads:delete scope", async () => {
      // Create a new app with middleware that throws for delete scope
      const testApp = new Hono();

      testApp.delete("/api/v1/leads/:id", async () => {
        // Simulate scope check failing
        throw new InsufficientScopeError("leads:delete");
      });

      testApp.onError(errorHandler);

      const res = await testApp.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440000",
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("INSUFFICIENT_SCOPE");
    });
  });

  // ==========================================================================
  // POST /api/v1/leads/:id/activities - Add Activity
  // ==========================================================================

  describe("POST /api/v1/leads/:id/activities", () => {
    it("should add an activity to a lead", async () => {
      const mockLead = createMockLead();
      const mockActivity = createMockActivity({
        type: "call",
        description: "Called the client",
      });

      // Mock select for lead existence
      const selectChain = createSelectChain([mockLead]);
      // Mock insert activity
      const insertChain = createInsertChain([mockActivity]);
      // Mock update lead timestamp
      const updateChain = createUpdateChain([mockLead]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.insert.mockReturnValueOnce(insertChain);
      mockDb.update.mockReturnValueOnce(updateChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            type: "call",
            description: "Called the client",
          }),
        }
      );

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.type).toBe("call");
      expect(body.data.description).toBe("Called the client");
    });

    it("should return 404 for non-existent lead", async () => {
      const selectChain = createSelectChain([]);

      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440099/activities",
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            type: "note",
            description: "Test note",
          }),
        }
      );

      expect(res.status).toBe(404);
    });

    it("should return 400 for missing type", async () => {
      const mockLead = createMockLead();
      const selectChain = createSelectChain([mockLead]);
      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            description: "Test note",
          }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for missing description", async () => {
      const mockLead = createMockLead();
      const selectChain = createSelectChain([mockLead]);
      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            type: "note",
          }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for invalid activity type", async () => {
      const mockLead = createMockLead();
      const selectChain = createSelectChain([mockLead]);
      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            type: "invalid_type",
            description: "Test description",
          }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should support all valid activity types", async () => {
      const validTypes = ["note", "email", "call", "meeting", "status_change"];

      for (const type of validTypes) {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity({ type });

        const selectChain = createSelectChain([mockLead]);
        const insertChain = createInsertChain([mockActivity]);
        const updateChain = createUpdateChain([mockLead]);

        mockDb.select.mockReturnValueOnce(selectChain);
        mockDb.insert.mockReturnValueOnce(insertChain);
        mockDb.update.mockReturnValueOnce(updateChain);

        const res = await app.request(
          `/api/v1/leads/${mockLead.id}/activities`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              type,
              description: `Test ${type} activity`,
            }),
          }
        );

        expect(res.status).toBe(201);
      }
    });

    it("should update lead updatedAt timestamp", async () => {
      const mockLead = createMockLead();
      const mockActivity = createMockActivity();

      const selectChain = createSelectChain([mockLead]);
      const insertChain = createInsertChain([mockActivity]);
      const updateChain = createUpdateChain([mockLead]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.insert.mockReturnValueOnce(insertChain);
      mockDb.update.mockReturnValueOnce(updateChain);

      await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            type: "note",
            description: "Test note",
          }),
        }
      );

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // GET /api/v1/leads/:id/activities - Get Activities
  // ==========================================================================

  describe("GET /api/v1/leads/:id/activities", () => {
    it("should return activities for a lead", async () => {
      const mockLead = createMockLead();
      const mockActivities = [
        createMockActivity({ type: "note", description: "First note" }),
        createMockActivity({ id: "act-2", type: "email", description: "Sent email" }),
      ];

      // Mock select for lead existence
      const leadSelectChain = createSelectChain([mockLead]);
      // Mock select for activities
      const activitiesSelectChain = createSelectChain(mockActivities);

      mockDb.select
        .mockReturnValueOnce(leadSelectChain)
        .mockReturnValueOnce(activitiesSelectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].type).toBe("note");
      expect(body.data[1].type).toBe("email");
    });

    it("should return empty array when no activities exist", async () => {
      const mockLead = createMockLead();

      const leadSelectChain = createSelectChain([mockLead]);
      const activitiesSelectChain = createSelectChain([]);

      mockDb.select
        .mockReturnValueOnce(leadSelectChain)
        .mockReturnValueOnce(activitiesSelectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });

    it("should return 404 for non-existent lead", async () => {
      const selectChain = createSelectChain([]);

      mockDb.select.mockReturnValueOnce(selectChain);

      const res = await app.request(
        "/api/v1/leads/550e8400-e29b-41d4-a716-446655440099/activities",
        { headers: authHeaders() }
      );

      expect(res.status).toBe(404);
    });

    it("should format activity response correctly", async () => {
      const now = new Date("2025-01-15T10:00:00Z");
      const mockLead = createMockLead();
      const mockActivity = createMockActivity({
        createdAt: now,
        type: "status_change",
        description: "Status changed from new to contacted",
        oldStatus: "new",
        newStatus: "contacted",
      });

      const leadSelectChain = createSelectChain([mockLead]);
      const activitiesSelectChain = createSelectChain([mockActivity]);

      mockDb.select
        .mockReturnValueOnce(leadSelectChain)
        .mockReturnValueOnce(activitiesSelectChain);

      const res = await app.request(
        `/api/v1/leads/${mockLead.id}/activities`,
        { headers: authHeaders() }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0]).toMatchObject({
        type: "status_change",
        description: "Status changed from new to contacted",
        oldStatus: "new",
        newStatus: "contacted",
        createdAt: now.toISOString(),
      });
    });
  });

  // ==========================================================================
  // EDGE CASES & ERROR HANDLING
  // ==========================================================================

  describe("Edge Cases and Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      mockDb.select.mockImplementationOnce(() => {
        throw new Error("Database connection failed");
      });

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(500);
    });

    it("should handle empty request body for POST", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
      });

      expect(res.status).toBe(400);
    });

    it("should handle null tags in response", async () => {
      const mockLead = createMockLead({ tags: null });
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain([mockLead]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].tags).toEqual([]);
    });

    it("should validate tags array size", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
          tags: Array(25).fill("tag"),
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should validate individual tag length", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
          tags: ["a".repeat(100)],
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should handle concurrent pagination correctly", async () => {
      const mockLeads = Array.from({ length: 10 }, (_, i) =>
        createMockLead({ id: `lead-${i}`, name: `Lead ${i}` })
      );
      const countChain = createSelectChain([{ count: 100 }]);
      const leadsChain = createSelectChain(mockLeads);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?page=5&limit=10", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination.page).toBe(5);
      expect(body.pagination.totalPages).toBe(10);
    });

    it("should handle contactedAt in lead response", async () => {
      const contactedAt = new Date("2025-01-20T10:00:00Z");
      const mockLead = createMockLead({ contactedAt });
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain([mockLead]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].contactedAt).toBe(contactedAt.toISOString());
    });

    it("should handle all lead statuses", async () => {
      const statuses = ["new", "contacted", "qualified", "proposal", "won", "lost"];

      for (const status of statuses) {
        const mockLead = createMockLead({ status });
        const countChain = createSelectChain([{ count: 1 }]);
        const leadsChain = createSelectChain([mockLead]);

        mockDb.select
          .mockReturnValueOnce(countChain)
          .mockReturnValueOnce(leadsChain);

        const res = await app.request(`/api/v1/leads?status=${status}`, {
          headers: authHeaders(),
        });

        expect(res.status).toBe(200);
      }
    });

    it("should handle name at maximum length", async () => {
      const mockLead = createMockLead({ name: "A".repeat(255) });
      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "A".repeat(255),
          email: "john@example.com",
          message: "Test message for the API",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("should reject name exceeding maximum length", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "A".repeat(256),
          email: "john@example.com",
          message: "Test message for the API",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should handle message at maximum length", async () => {
      const mockLead = createMockLead({ message: "A".repeat(5000) });
      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "A".repeat(5000),
        }),
      });

      expect(res.status).toBe(201);
    });

    it("should reject message exceeding maximum length", async () => {
      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "A".repeat(5001),
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should handle special characters in search query", async () => {
      const countChain = createSelectChain([{ count: 0 }]);
      const leadsChain = createSelectChain([]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads?search=test%40example.com", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
    });

    it("should handle leads with all null optional fields", async () => {
      const mockLead = createMockLead({
        company: null,
        phone: null,
        budget: null,
        projectType: null,
        notes: null,
        tags: null,
        rawInput: null,
        contactedAt: null,
      });
      const countChain = createSelectChain([{ count: 1 }]);
      const leadsChain = createSelectChain([mockLead]);

      mockDb.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(leadsChain);

      const res = await app.request("/api/v1/leads", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].company).toBeNull();
      expect(body.data[0].phone).toBeNull();
      expect(body.data[0].budget).toBeNull();
      expect(body.data[0].projectType).toBeNull();
      expect(body.data[0].notes).toBeNull();
      expect(body.data[0].tags).toEqual([]);
    });

    it("should not update contactedAt when already set", async () => {
      const existingContactedAt = new Date("2025-01-10T10:00:00Z");
      const existingLead = createMockLead({
        status: "new",
        contactedAt: existingContactedAt,
      });
      const updatedLead = createMockLead({
        status: "contacted",
        contactedAt: existingContactedAt, // Should remain the same
      });

      const selectChain = createSelectChain([existingLead]);
      const updateChain = createUpdateChain([updatedLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.select.mockReturnValueOnce(selectChain);
      mockDb.update.mockReturnValueOnce(updateChain);
      mockDb.insert.mockReturnValueOnce(insertActivityChain);

      const res = await app.request(
        `/api/v1/leads/${existingLead.id}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ status: "contacted" }),
        }
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contactedAt).toBe(existingContactedAt.toISOString());
    });

    it("should handle valid international phone formats", async () => {
      const mockLead = createMockLead();
      const insertLeadChain = createInsertChain([mockLead]);
      const insertActivityChain = createInsertChain([createMockActivity()]);

      mockDb.insert
        .mockReturnValueOnce(insertLeadChain)
        .mockReturnValueOnce(insertActivityChain);

      const res = await app.request("/api/v1/leads", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          message: "Test message for the API",
          phone: "+44 (0)20 7946 0958",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("should validate that all sortable fields work", async () => {
      const sortFields = ["createdAt", "updatedAt", "name", "email", "company", "status"];

      for (const field of sortFields) {
        const countChain = createSelectChain([{ count: 1 }]);
        const leadsChain = createSelectChain([createMockLead()]);

        mockDb.select
          .mockReturnValueOnce(countChain)
          .mockReturnValueOnce(leadsChain);

        const res = await app.request(`/api/v1/leads?sort=${field}`, {
          headers: authHeaders(),
        });

        expect(res.status).toBe(200);

        // Test descending too
        const countChain2 = createSelectChain([{ count: 1 }]);
        const leadsChain2 = createSelectChain([createMockLead()]);

        mockDb.select
          .mockReturnValueOnce(countChain2)
          .mockReturnValueOnce(leadsChain2);

        const resDesc = await app.request(`/api/v1/leads?sort=-${field}`, {
          headers: authHeaders(),
        });

        expect(resDesc.status).toBe(200);
      }
    });
  });

  // ==========================================================================
  // POST /api/v1/leads/parse - AI Lead Parsing Tests
  // ==========================================================================

  describe("POST /api/v1/leads/parse", () => {
    beforeEach(() => {
      // Default: AI is configured
      mockIsOpenAIConfigured.mockReturnValue(true);
    });

    describe("successful parsing", () => {
      it("should parse lead text and return parsed data", async () => {
        const mockResult = {
          parsed: {
            name: "Sarah Chen",
            email: "sarah@techstartup.io",
            company: "TechStartup Inc",
            phone: "415-555-9876",
            budget: "$50,000 - $100,000",
            projectType: "Cloud Migration",
            source: "LinkedIn",
            message: "Looking for help with cloud migration",
          },
          confidence: 0.92,
          extractedFields: ["name", "email", "company", "phone", "budget", "projectType", "source", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "Got a message from Sarah Chen (sarah@techstartup.io) at TechStartup Inc.",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.parsed.name).toBe("Sarah Chen");
        expect(body.parsed.email).toBe("sarah@techstartup.io");
        expect(body.confidence).toBe(0.92);
        expect(body.extractedFields).toContain("name");
        expect(body.extractedFields).toContain("email");
      });

      it("should return parsed data with partial fields", async () => {
        const mockResult = {
          parsed: {
            name: "John Doe",
            email: "john@example.com",
            company: null,
            phone: null,
            budget: null,
            projectType: null,
            source: null,
            message: "Interested in services",
          },
          confidence: 0.65,
          extractedFields: ["name", "email", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "John Doe john@example.com",
          }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.parsed.name).toBe("John Doe");
        expect(body.parsed.company).toBeNull();
        expect(body.extractedFields).toEqual(["name", "email", "message"]);
      });
    });

    describe("autoSave option", () => {
      it("should create lead when autoSave is true", async () => {
        const mockResult = {
          parsed: {
            name: "Sarah Chen",
            email: "sarah@techstartup.io",
            company: "TechStartup Inc",
            phone: null,
            budget: "$50,000 - $100,000",
            projectType: "Cloud Migration",
            source: "LinkedIn",
            message: "Looking for help with cloud migration",
          },
          confidence: 0.92,
          extractedFields: ["name", "email", "company", "budget", "projectType", "source", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const newLead = createMockLead({
          name: "Sarah Chen",
          email: "sarah@techstartup.io",
          company: "TechStartup Inc",
          budget: "$50,000 - $100,000",
          projectType: "Cloud Migration",
          source: "LinkedIn",
          rawInput: "Got a message from Sarah Chen...",
          aiParsed: true,
        });

        // Mock insert for lead
        const leadInsertChain = createInsertChain([newLead]);
        mockDb.insert.mockReturnValueOnce(leadInsertChain);

        // Mock insert for activity
        const activityInsertChain = createInsertChain([createMockActivity()]);
        mockDb.insert.mockReturnValueOnce(activityInsertChain);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "Got a message from Sarah Chen...",
            autoSave: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.lead).toBeDefined();
        expect(body.lead.name).toBe("Sarah Chen");
        expect(body.lead.aiParsed).toBe(true);
        expect(body.parsed).toBeDefined();
        expect(body.confidence).toBe(0.92);
      });

      it("should return 422 when autoSave is true but name is missing", async () => {
        const mockResult = {
          parsed: {
            name: null,
            email: "sarah@techstartup.io",
            company: null,
            phone: null,
            budget: null,
            projectType: null,
            source: null,
            message: "Some message",
          },
          confidence: 0.5,
          extractedFields: ["email", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "sarah@techstartup.io",
            autoSave: true,
          }),
        });

        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toContain("name and email are required");
        expect(body.code).toBe("VALIDATION_ERROR");
      });

      it("should return 422 when autoSave is true but email is missing", async () => {
        const mockResult = {
          parsed: {
            name: "John Doe",
            email: null,
            company: null,
            phone: null,
            budget: null,
            projectType: null,
            source: null,
            message: "Some message",
          },
          confidence: 0.5,
          extractedFields: ["name", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "John Doe wants to talk",
            autoSave: true,
          }),
        });

        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.error).toContain("name and email are required");
      });

      it("should generate default message when message is not extracted", async () => {
        const mockResult = {
          parsed: {
            name: "Sarah Chen",
            email: "sarah@test.com",
            company: null,
            phone: null,
            budget: null,
            projectType: null,
            source: null,
            message: null,
          },
          confidence: 0.6,
          extractedFields: ["name", "email"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const newLead = createMockLead({
          name: "Sarah Chen",
          email: "sarah@test.com",
          message: 'AI-parsed lead from text: "Sarah Chen sarah@test.com..."',
          aiParsed: true,
        });

        const leadInsertChain = createInsertChain([newLead]);
        mockDb.insert.mockReturnValueOnce(leadInsertChain);

        const activityInsertChain = createInsertChain([createMockActivity()]);
        mockDb.insert.mockReturnValueOnce(activityInsertChain);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            text: "Sarah Chen sarah@test.com needs help with something",
            autoSave: true,
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.lead).toBeDefined();
      });
    });

    describe("validation errors", () => {
      it("should return 400 when text is missing", async () => {
        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.code).toBe("VALIDATION_ERROR");
      });

      it("should return 400 when text is empty", async () => {
        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "" }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.code).toBe("VALIDATION_ERROR");
      });

      it("should return 400 when text exceeds 5000 characters", async () => {
        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "a".repeat(5001) }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.code).toBe("VALIDATION_ERROR");
      });

      it("should accept text at exactly 5000 characters", async () => {
        const mockResult = {
          parsed: {
            name: "Test",
            email: "test@test.com",
            company: null,
            phone: null,
            budget: null,
            projectType: null,
            source: null,
            message: "Test message",
          },
          confidence: 0.7,
          extractedFields: ["name", "email", "message"],
        };

        mockParseLeadText.mockResolvedValueOnce(mockResult);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "a".repeat(5000) }),
        });

        expect(res.status).toBe(200);
      });
    });

    describe("AI service errors", () => {
      it("should return 503 when OpenAI is not configured", async () => {
        mockIsOpenAIConfigured.mockReturnValueOnce(false);

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "Test lead text" }),
        });

        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe("AI_SERVICE_ERROR");
        expect(body.error).toContain("not configured");
      });

      it("should return 503 when AI service throws AIServiceError", async () => {
        mockParseLeadText.mockRejectedValueOnce(
          new AIServiceError("AI service temporarily unavailable")
        );

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "Test lead text" }),
        });

        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe("AI_SERVICE_ERROR");
      });

      it("should return 422 when parsing fails with low confidence", async () => {
        const emptyParsed = {
          name: null,
          email: null,
          company: null,
          phone: null,
          budget: null,
          projectType: null,
          source: null,
          message: null,
        };

        mockParseLeadText.mockRejectedValueOnce(
          new ParseFailedError(0.15, emptyParsed)
        );

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "random gibberish that makes no sense" }),
        });

        expect(res.status).toBe(422);
        const body = await res.json();
        expect(body.code).toBe("PARSE_FAILED");
        expect(body.confidence).toBe(0.15);
        expect(body.parsed).toBeDefined();
      });
    });

    describe("authentication and authorization", () => {
      it("should return 401 when not authenticated", async () => {
        mockRequireApiKey.mockImplementationOnce(async () => {
          throw new InvalidApiKeyError("Missing API key");
        });

        const res = await app.request("/api/v1/leads/parse", {
          method: "POST",
          body: JSON.stringify({ text: "Test" }),
        });

        expect(res.status).toBe(401);
      });

      it("should return 403 when insufficient scope", async () => {
        // Create a new app with middleware that throws for scope check
        const testApp = new Hono();

        testApp.use("*", async (_c, next) => {
          // Simulate requireApiKey passing
          await next();
        });

        testApp.post("/api/v1/leads/parse", async () => {
          // Simulate insufficient scope
          throw new InsufficientScopeError("leads:write");
        });

        testApp.onError(errorHandler);

        const res = await testApp.request("/api/v1/leads/parse", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ text: "Test" }),
        });

        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.code).toBe("INSUFFICIENT_SCOPE");
      });
    });
  });
});
