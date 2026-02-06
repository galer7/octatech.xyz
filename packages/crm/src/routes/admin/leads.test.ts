/**
 * Tests for admin leads routes.
 *
 * These tests verify that the admin leads endpoints require proper
 * session-based authentication and handle validation correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

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
vi.mock("../../db", () => {
  const mockDb = {
    select: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn(() => mockDb),
    limit: vi.fn(() => mockDb),
    offset: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    update: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    values: vi.fn(() => mockDb),
    returning: vi.fn(() => Promise.resolve([])),
    then: vi.fn((resolve: (value: unknown[]) => void) => resolve([])),
  };

  return {
    db: mockDb,
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
  };
});

// Mock the webhooks
vi.mock("../../lib/webhooks", () => ({
  triggerLeadCreated: vi.fn().mockResolvedValue(undefined),
  triggerLeadUpdated: vi.fn().mockResolvedValue(undefined),
  triggerLeadStatusChanged: vi.fn().mockResolvedValue(undefined),
  triggerLeadDeleted: vi.fn().mockResolvedValue(undefined),
  triggerLeadActivityAdded: vi.fn().mockResolvedValue(undefined),
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
  isOpenAIConfigured: vi.fn(),
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

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;

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

// Valid UUID for testing route structure (will trigger DB lookup but prove route exists)
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Admin Leads Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup authenticated session by default
    const mockSession = createMockSession();
    mockValidateSession.mockResolvedValue(mockSession);
    mockShouldRefreshSession.mockReturnValue(false);

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
});
