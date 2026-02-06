/**
 * Tests for admin leads routes.
 *
 * These tests verify that the admin leads endpoints require proper
 * session-based authentication and handle validation correctly.
 *
 * WEBHOOK INTEGRATION TESTS: Tests verify that webhook trigger functions
 * are called with correct arguments when lead operations occur:
 * - triggerLeadCreated: POST /api/admin/leads
 * - triggerLeadUpdated: PATCH /api/admin/leads/:id (when fields change)
 * - triggerLeadStatusChanged: PATCH when status changes
 * - triggerLeadDeleted: DELETE /api/admin/leads/:id
 * - triggerLeadActivityAdded: POST /api/admin/leads/:id/activities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// Valid UUID for testing
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const ACTIVITY_UUID = "660e8400-e29b-41d4-a716-446655440001";

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

// Mock the database - just vi.fn() for each method, implementations set per test
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  leads: {
    id: "id",
    name: "name",
    email: "email",
    company: "company",
    phone: "phone",
    budget: "budget",
    projectType: "projectType",
    message: "message",
    source: "source",
    status: "status",
    notes: "notes",
    tags: "tags",
    rawInput: "rawInput",
    aiParsed: "aiParsed",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    contactedAt: "contactedAt",
  },
  leadActivities: {
    id: "id",
    leadId: "leadId",
    type: "type",
    description: "description",
    oldStatus: "oldStatus",
    newStatus: "newStatus",
    createdAt: "createdAt",
  },
  leadStatusEnum: ["new", "contacted", "qualified", "proposal", "won", "lost"],
  activityTypeEnum: ["note", "email", "call", "meeting", "status_change"],
}));

// Mock the webhooks - must return Promises
vi.mock("../../lib/webhooks", () => ({
  triggerLeadCreated: vi.fn(() => Promise.resolve()),
  triggerLeadUpdated: vi.fn(() => Promise.resolve()),
  triggerLeadStatusChanged: vi.fn(() => Promise.resolve()),
  triggerLeadDeleted: vi.fn(() => Promise.resolve()),
  triggerLeadActivityAdded: vi.fn(() => Promise.resolve()),
}));

// Mock the AI module
vi.mock("../../lib/ai", () => ({
  parseLeadText: vi.fn(),
  AIServiceError: class AIServiceError extends Error {
    code = "AI_SERVICE_ERROR";
  },
  ParseFailedError: class ParseFailedError extends Error {
    code = "PARSE_FAILED";
    confidence = 0.3;
    parsed = {};
  },
  isOpenAIConfigured: vi.fn(() => false),
}));

// Import after mocking
import { adminLeadsRoutes } from "./leads";
import { errorHandler } from "../../middleware/error-handler";
import {
  validateSession,
  shouldRefreshSession,
  SESSION_CONFIG,
} from "../../lib/session";
import type { SessionData } from "../../lib/session";
import { db } from "../../db";
import {
  triggerLeadCreated,
  triggerLeadUpdated,
  triggerLeadStatusChanged,
  triggerLeadDeleted,
  triggerLeadActivityAdded,
} from "../../lib/webhooks";
import { isOpenAIConfigured, parseLeadText } from "../../lib/ai";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
const mockDb = db as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const mockTriggerLeadCreated = triggerLeadCreated as ReturnType<typeof vi.fn>;
const mockTriggerLeadUpdated = triggerLeadUpdated as ReturnType<typeof vi.fn>;
const mockTriggerLeadStatusChanged = triggerLeadStatusChanged as ReturnType<typeof vi.fn>;
const mockTriggerLeadDeleted = triggerLeadDeleted as ReturnType<typeof vi.fn>;
const mockTriggerLeadActivityAdded = triggerLeadActivityAdded as ReturnType<typeof vi.fn>;
const mockIsOpenAIConfigured = isOpenAIConfigured as ReturnType<typeof vi.fn>;
const mockParseLeadText = parseLeadText as ReturnType<typeof vi.fn>;

/**
 * Create a mock session for testing.
 */
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

/**
 * Creates a mock lead object for testing.
 */
function createMockLead(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: VALID_UUID,
    name: "Test Lead",
    email: "test@example.com",
    company: "Test Company",
    phone: "+1-555-123-4567",
    budget: "$10,000 - $50,000",
    projectType: "Web Application",
    message: "Need help with a web project",
    source: "Admin",
    status: "new",
    notes: null,
    tags: null,
    rawInput: null,
    aiParsed: false,
    createdAt: now,
    updatedAt: now,
    contactedAt: null,
    ...overrides,
  };
}

/**
 * Creates a mock activity object for testing.
 */
function createMockActivity(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: ACTIVITY_UUID,
    leadId: VALID_UUID,
    type: "note",
    description: "Test activity",
    oldStatus: null,
    newStatus: null,
    createdAt: now,
    ...overrides,
  };
}

/**
 * Setup database mock to return empty results (for tests that don't need DB)
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

describe("Admin Leads Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-establish webhook mock implementations
    mockTriggerLeadCreated.mockImplementation(() => Promise.resolve());
    mockTriggerLeadUpdated.mockImplementation(() => Promise.resolve());
    mockTriggerLeadStatusChanged.mockImplementation(() => Promise.resolve());
    mockTriggerLeadDeleted.mockImplementation(() => Promise.resolve());
    mockTriggerLeadActivityAdded.mockImplementation(() => Promise.resolve());

    // Setup authenticated session by default
    const mockSession = createMockSession();
    mockValidateSession.mockResolvedValue(mockSession);
    mockShouldRefreshSession.mockReturnValue(false);

    // Setup empty db mock by default
    setupEmptyDbMock();

    // Create app with routes
    app = new Hono();
    app.route("/api/admin/leads", adminLeadsRoutes);
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

      const res = await app.request("/api/admin/leads");

      expect(res.status).toBe(401);
    });

    it("rejects requests with invalid session", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/leads", {
        headers: { Cookie: "session=invalid-token" },
      });

      expect(res.status).toBe(401);
    });

    it("rejects POST requests without CSRF header", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Test Lead",
          email: "test@example.com",
          message: "Test message",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("rejects PATCH requests without CSRF header", async () => {
      const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: "test" }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Invalid request");
    });

    it("rejects DELETE requests without CSRF header", async () => {
      const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
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
    it("validates required fields on create", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Test",
          // Missing email and message
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("validates email format on create", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Test",
          email: "not-an-email",
          message: "Test",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.email).toBeDefined();
    });

    it("validates status value on create", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name: "Test",
          email: "test@example.com",
          message: "Test",
          status: "invalid_status",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================================================
  // 404 TESTS (Invalid UUID)
  // ==========================================================================

  describe("Invalid UUID handling", () => {
    it("returns 404 for invalid UUID format on GET /:id", async () => {
      const res = await app.request("/api/admin/leads/invalid-uuid", {
        headers: { Cookie: `${SESSION_CONFIG.cookieName}=valid_token` },
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid UUID format on PATCH /:id", async () => {
      const res = await app.request("/api/admin/leads/invalid-uuid", {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ notes: "test" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid UUID format on DELETE /:id", async () => {
      const res = await app.request("/api/admin/leads/invalid-uuid", {
        method: "DELETE",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid UUID format on POST /:id/activities", async () => {
      const res = await app.request("/api/admin/leads/invalid-uuid/activities", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ type: "note", description: "test" }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // EMPTY BODY / BAD REQUEST TESTS
  // ==========================================================================

  describe("Empty/bad request handling", () => {
    it("rejects empty body on POST", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("handles non-JSON body gracefully on POST", async () => {
      const res = await app.request("/api/admin/leads", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: "not json",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 503 when AI is not configured on parse endpoint", async () => {
      const res = await app.request("/api/admin/leads/parse", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ text: "Test text" }),
      });

      // AI is not configured by default (mock returns false)
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("AI_SERVICE_ERROR");
    });
  });

  // ==========================================================================
  // WEBHOOK TRIGGERING TESTS
  //
  // These tests verify that webhook trigger functions are called correctly
  // when lead operations occur. They test the integration between the routes
  // and the webhook system to ensure proper event dispatching.
  // ==========================================================================

  describe("Webhook Triggering", () => {
    describe("lead.created webhook", () => {
      it("triggers triggerLeadCreated on successful POST /api/admin/leads", async () => {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity();

        // Setup db mock for insert (lead insert, then activity insert)
        let insertCallCount = 0;
        mockDb.insert.mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              insertCallCount++;
              if (insertCallCount === 1) return Promise.resolve([mockLead]);
              return Promise.resolve([mockActivity]);
            }),
          }),
        }));

        const res = await app.request("/api/admin/leads", {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            name: "Test Lead",
            email: "test@example.com",
            message: "Need help with a web project",
          }),
        });

        expect(res.status).toBe(201);

        // Allow time for fire-and-forget webhook call
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify webhook was triggered with the created lead
        expect(mockTriggerLeadCreated).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadCreated).toHaveBeenCalledWith(
          expect.objectContaining({
            id: mockLead.id,
            name: mockLead.name,
            email: mockLead.email,
          })
        );
      });

      it("triggers triggerLeadCreated when AI parsing with autoSave=true", async () => {
        const mockLead = createMockLead({ aiParsed: true, rawInput: "Sarah from Acme" });
        const mockActivity = createMockActivity();

        // Setup AI mock
        mockIsOpenAIConfigured.mockReturnValue(true);
        mockParseLeadText.mockResolvedValue({
          parsed: {
            name: "Sarah Connor",
            email: "sarah@acme.com",
            company: "Acme Corp",
            phone: null,
            budget: null,
            projectType: null,
            message: null,
            source: null,
          },
          confidence: 0.95,
          extractedFields: ["name", "email", "company"],
        });

        // Setup DB mock for insert
        let insertCallCount = 0;
        mockDb.insert.mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              insertCallCount++;
              if (insertCallCount === 1) return Promise.resolve([mockLead]);
              return Promise.resolve([mockActivity]);
            }),
          }),
        }));

        const res = await app.request("/api/admin/leads/parse", {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            text: "Got a lead from Sarah Connor at Acme Corp, email sarah@acme.com",
            autoSave: true,
          }),
        });

        expect(res.status).toBe(201);

        // Allow time for fire-and-forget webhook call
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify webhook was triggered
        expect(mockTriggerLeadCreated).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadCreated).toHaveBeenCalledWith(
          expect.objectContaining({
            id: mockLead.id,
            aiParsed: true,
          })
        );
      });
    });

    describe("lead.updated webhook", () => {
      it("triggers triggerLeadUpdated on PATCH when fields change", async () => {
        const existingLead = createMockLead();
        const updatedLead = createMockLead({ notes: "Updated notes" });

        // Setup select mock to return existing lead
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        // Setup update mock
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ notes: "Updated notes" }),
        });

        expect(res.status).toBe(200);

        // Allow time for fire-and-forget webhook call
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify lead.updated webhook was triggered with changes
        expect(mockTriggerLeadUpdated).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ id: VALID_UUID }),
          expect.objectContaining({
            notes: { old: null, new: "Updated notes" },
          })
        );
      });

      it("does NOT trigger triggerLeadUpdated when no actual changes occur", async () => {
        const existingLead = createMockLead({ notes: "Same notes" });
        const updatedLead = createMockLead({ notes: "Same notes" });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ notes: "Same notes" }),
        });

        expect(res.status).toBe(200);

        // Allow time for any potential webhook calls
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Webhook should NOT be triggered when value doesn't actually change
        expect(mockTriggerLeadUpdated).not.toHaveBeenCalled();
      });

      it("tracks multiple field changes in triggerLeadUpdated", async () => {
        const existingLead = createMockLead({
          name: "Old Name",
          company: "Old Company",
        });
        const updatedLead = createMockLead({
          name: "New Name",
          company: "New Company",
        });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            name: "New Name",
            company: "New Company",
          }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify both changes are tracked
        expect(mockTriggerLeadUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ id: VALID_UUID }),
          expect.objectContaining({
            name: { old: "Old Name", new: "New Name" },
            company: { old: "Old Company", new: "New Company" },
          })
        );
      });
    });

    describe("lead.status_changed webhook", () => {
      it("triggers triggerLeadStatusChanged when status changes", async () => {
        const existingLead = createMockLead({ status: "new" });
        const updatedLead = createMockLead({ status: "contacted" });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        // Insert for status change activity
        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([createMockActivity({ type: "status_change" })]),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ status: "contacted" }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify status_changed webhook was triggered
        expect(mockTriggerLeadStatusChanged).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadStatusChanged).toHaveBeenCalledWith(
          expect.objectContaining({ id: VALID_UUID, status: "contacted" }),
          "new", // previous status
          "contacted" // new status
        );

        // Also verify lead.updated was triggered
        expect(mockTriggerLeadUpdated).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ id: VALID_UUID }),
          expect.objectContaining({
            status: { old: "new", new: "contacted" },
          })
        );
      });

      it("does NOT trigger triggerLeadStatusChanged when status is unchanged", async () => {
        const existingLead = createMockLead({ status: "new", notes: "Old notes" });
        const updatedLead = createMockLead({ status: "new", notes: "New notes" });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ notes: "New notes" }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Status unchanged so status_changed webhook should NOT be triggered
        expect(mockTriggerLeadStatusChanged).not.toHaveBeenCalled();

        // But updated webhook should be triggered for notes change
        expect(mockTriggerLeadUpdated).toHaveBeenCalledTimes(1);
      });

      it("triggers both status_changed and updated webhooks on status change", async () => {
        const existingLead = createMockLead({ status: "contacted" });
        const updatedLead = createMockLead({ status: "qualified" });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ status: "qualified" }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Both webhooks should be triggered
        expect(mockTriggerLeadUpdated).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadStatusChanged).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadStatusChanged).toHaveBeenCalledWith(
          expect.anything(),
          "contacted",
          "qualified"
        );
      });
    });

    describe("lead.deleted webhook", () => {
      it("triggers triggerLeadDeleted on DELETE /api/admin/leads/:id", async () => {
        const mockLead = createMockLead({
          name: "Lead To Delete",
          email: "delete@example.com",
        });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "DELETE",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify deleted webhook was triggered with lead info
        expect(mockTriggerLeadDeleted).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadDeleted).toHaveBeenCalledWith(
          VALID_UUID,
          "Lead To Delete",
          "delete@example.com"
        );
      });

      it("captures lead info before deletion for webhook", async () => {
        const mockLead = createMockLead({
          id: VALID_UUID,
          name: "Special Lead",
          email: "special@test.com",
          company: "Test Corp",
        });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "DELETE",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify the exact arguments match the lead's data
        expect(mockTriggerLeadDeleted).toHaveBeenCalledWith(
          VALID_UUID,
          "Special Lead",
          "special@test.com"
        );
      });
    });

    describe("lead.activity_added webhook", () => {
      it("triggers triggerLeadActivityAdded on POST /api/admin/leads/:id/activities", async () => {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity({
          type: "call",
          description: "Discussed project requirements",
        });

        // Setup select to return lead
        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        // Setup insert for activity creation
        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockActivity]),
          }),
        });

        // Setup update for lead's updatedAt
        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}/activities`, {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            type: "call",
            description: "Discussed project requirements",
          }),
        });

        expect(res.status).toBe(201);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Verify activity_added webhook was triggered
        expect(mockTriggerLeadActivityAdded).toHaveBeenCalledTimes(1);
        expect(mockTriggerLeadActivityAdded).toHaveBeenCalledWith(
          expect.objectContaining({
            id: mockLead.id,
            name: mockLead.name,
          }),
          expect.objectContaining({
            type: "call",
            description: "Discussed project requirements",
          })
        );
      });

      it("passes correct activity data to webhook for different activity types", async () => {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity({
          type: "meeting",
          description: "Initial consultation meeting",
        });

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockActivity]),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const res = await app.request(`/api/admin/leads/${VALID_UUID}/activities`, {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            type: "meeting",
            description: "Initial consultation meeting",
          }),
        });

        expect(res.status).toBe(201);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockTriggerLeadActivityAdded).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            type: "meeting",
            description: "Initial consultation meeting",
            leadId: VALID_UUID,
          })
        );
      });
    });

    describe("Webhook error handling", () => {
      it("does not fail request when webhook trigger throws error", async () => {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity();

        // Make webhook trigger throw an error
        mockTriggerLeadCreated.mockRejectedValue(new Error("Webhook delivery failed"));

        let insertCallCount = 0;
        mockDb.insert.mockImplementation(() => ({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              insertCallCount++;
              if (insertCallCount === 1) return Promise.resolve([mockLead]);
              return Promise.resolve([mockActivity]);
            }),
          }),
        }));

        // Suppress console.error for this test
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await app.request("/api/admin/leads", {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            name: "Test Lead",
            email: "test@example.com",
            message: "Test message",
          }),
        });

        // Request should still succeed even if webhook fails
        expect(res.status).toBe(201);

        await new Promise((resolve) => setTimeout(resolve, 10));

        // Webhook was called
        expect(mockTriggerLeadCreated).toHaveBeenCalled();

        // Error was logged
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to trigger lead.created webhook:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it("logs error when lead.updated webhook fails", async () => {
        const existingLead = createMockLead();
        const updatedLead = createMockLead({ notes: "Updated" });

        mockTriggerLeadUpdated.mockRejectedValue(new Error("Network error"));

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ notes: "Updated" }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to trigger lead.updated webhook:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it("logs error when lead.deleted webhook fails", async () => {
        const mockLead = createMockLead();

        mockTriggerLeadDeleted.mockRejectedValue(new Error("Timeout"));

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        mockDb.delete.mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "DELETE",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to trigger lead.deleted webhook:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it("logs error when lead.activity_added webhook fails", async () => {
        const mockLead = createMockLead();
        const mockActivity = createMockActivity();

        mockTriggerLeadActivityAdded.mockRejectedValue(new Error("Connection refused"));

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([mockLead]),
            }),
          }),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockActivity]),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await app.request(`/api/admin/leads/${VALID_UUID}/activities`, {
          method: "POST",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({
            type: "note",
            description: "Test note",
          }),
        });

        expect(res.status).toBe(201);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to trigger lead.activity_added webhook:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it("logs error when lead.status_changed webhook fails", async () => {
        const existingLead = createMockLead({ status: "new" });
        const updatedLead = createMockLead({ status: "contacted" });

        mockTriggerLeadStatusChanged.mockRejectedValue(new Error("Service unavailable"));

        mockDb.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingLead]),
            }),
          }),
        });

        mockDb.update.mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedLead]),
            }),
          }),
        });

        mockDb.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        });

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await app.request(`/api/admin/leads/${VALID_UUID}`, {
          method: "PATCH",
          headers: {
            Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ status: "contacted" }),
        });

        expect(res.status).toBe(200);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to trigger lead.status_changed webhook:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });
    });
  });
});
