/**
 * Tests for admin settings management routes.
 *
 * Verifies GET and PATCH operations for system settings.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
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
  const createChain = (finalValue: unknown[] = []) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(finalValue));
    chain.offset = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.set = vi.fn(() => chain);
    chain.values = vi.fn(() => chain);
    chain.returning = vi.fn(() => Promise.resolve(finalValue));
    chain.onConflictDoUpdate = vi.fn(() => chain);
    return chain;
  };

  const mockDb = createChain();

  return {
    db: mockDb,
    settings: {
      key: "key",
      value: "value",
      updatedAt: "updatedAt",
    },
  };
});

// Import after mocking
import { adminSettingsRoutes } from "./settings";
import { errorHandler } from "../../middleware/error-handler";
import {
  validateSession,
  shouldRefreshSession,
  SESSION_CONFIG,
} from "../../lib/session";
import { db } from "../../db";
import type { SessionData } from "../../lib/session";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<
  typeof vi.fn
>;
const mockDb = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
};

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
 * Helper to make authenticated requests.
 */
function authHeaders(csrfRequired = false) {
  const headers: Record<string, string> = {
    Cookie: `${SESSION_CONFIG.cookieName}=valid_session_token`,
  };
  if (csrfRequired) {
    headers["X-Requested-With"] = "XMLHttpRequest";
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/**
 * Create a mock setting object.
 */
function createMockSetting(key: string, value: unknown) {
  const now = new Date();
  return {
    key,
    value,
    updatedAt: now,
  };
}

/**
 * Setup mock db to return specific values for different keys.
 */
function setupMockDbForGet(settingsMap: Record<string, unknown>) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn((condition: unknown) => {
      // Return the appropriate setting based on the where clause
      return chain;
    }),
    limit: vi.fn().mockImplementation(() => {
      // This will be called multiple times for each setting
      return Promise.resolve([]);
    }),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  };

  // Track which key is being queried
  let queryCount = 0;
  const keys = ["cal_link", "openai_api_key", "admin_email"];

  chain.limit.mockImplementation(() => {
    const key = keys[queryCount % 3];
    queryCount++;
    if (settingsMap[key] !== undefined) {
      return Promise.resolve([createMockSetting(key, settingsMap[key])]);
    }
    return Promise.resolve([]);
  });

  mockDb.select.mockImplementation(() => chain);
  mockDb.insert.mockImplementation(() => chain);

  return chain;
}

describe("Admin Settings Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup authenticated session by default
    const mockSession = createMockSession();
    mockValidateSession.mockResolvedValue(mockSession);
    mockShouldRefreshSession.mockReturnValue(false);

    // Create app with routes
    app = new Hono();
    app.route("/api/admin/settings", adminSettingsRoutes);
    app.onError(errorHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // GET /api/admin/settings - Get all settings
  // ==========================================================================
  describe("GET /api/admin/settings", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/settings");

      expect(res.status).toBe(401);
    });

    it("should return null settings when none exist", async () => {
      setupMockDbForGet({});

      const res = await app.request("/api/admin/settings", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings.cal_link).toBeNull();
      expect(body.settings.openai_api_key).toBeNull();
      expect(body.settings.admin_email).toBeNull();
    });

    it("should return settings with masked OpenAI API key", async () => {
      setupMockDbForGet({
        openai_api_key: "sk-proj-1234567890abcdefghijklmnop",
        cal_link: "octatech/discovery",
        admin_email: "admin@example.com",
      });

      const res = await app.request("/api/admin/settings", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      // OpenAI API key should be masked (shows sk- prefix and last 4 chars)
      expect(body.settings.openai_api_key).toMatch(/^sk-••••••••/);
      expect(body.settings.openai_api_key).toContain("mnop");
    });

    it("should return cal_link unmasked", async () => {
      setupMockDbForGet({
        cal_link: "myuser/meeting",
      });

      const res = await app.request("/api/admin/settings", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings.cal_link).toBe("myuser/meeting");
    });

    it("should return admin_email unmasked", async () => {
      setupMockDbForGet({
        admin_email: "contact@company.com",
      });

      const res = await app.request("/api/admin/settings", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings.admin_email).toBe("contact@company.com");
    });
  });

  // ==========================================================================
  // PATCH /api/admin/settings - Update settings
  // ==========================================================================
  describe("PATCH /api/admin/settings", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cal_link: "test/meeting" }),
      });

      expect(res.status).toBe(401);
    });

    it("should return 401 without CSRF header", async () => {
      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cal_link: "test/meeting" }),
      });

      expect(res.status).toBe(401);
    });

    it("should update cal_link setting", async () => {
      setupMockDbForGet({ cal_link: "octatech/newlink" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ cal_link: "octatech/newlink" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings).toBeDefined();
    });

    it("should update openai_api_key setting", async () => {
      setupMockDbForGet({ openai_api_key: "sk-proj-newkey123456789" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ openai_api_key: "sk-proj-newkey123456789" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings).toBeDefined();
    });

    it("should update admin_email setting", async () => {
      setupMockDbForGet({ admin_email: "new-admin@example.com" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ admin_email: "new-admin@example.com" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings).toBeDefined();
    });

    it("should update multiple settings at once", async () => {
      setupMockDbForGet({
        cal_link: "octatech/updated",
        admin_email: "updated@example.com",
      });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({
          cal_link: "octatech/updated",
          admin_email: "updated@example.com",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.settings).toBeDefined();
    });

    it("should validate cal_link format (reject invalid format)", async () => {
      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ cal_link: "not-a-valid-format" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.cal_link).toBeDefined();
    });

    it("should validate openai_api_key format (should start with sk-)", async () => {
      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ openai_api_key: "invalid-api-key" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.openai_api_key).toBeDefined();
    });

    it("should validate admin_email format (valid email)", async () => {
      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ admin_email: "not-an-email" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.admin_email).toBeDefined();
    });

    it("should return 400 for empty request body", async () => {
      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("At least one setting");
    });

    it("should accept valid cal_link format", async () => {
      setupMockDbForGet({ cal_link: "user/30min" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ cal_link: "user/30min" }),
      });

      expect(res.status).toBe(200);
    });

    it("should accept valid openai_api_key starting with sk-", async () => {
      setupMockDbForGet({ openai_api_key: "sk-validkey12345" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ openai_api_key: "sk-validkey12345" }),
      });

      expect(res.status).toBe(200);
    });

    it("should accept valid email for admin_email", async () => {
      setupMockDbForGet({ admin_email: "valid.email@company.org" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ admin_email: "valid.email@company.org" }),
      });

      expect(res.status).toBe(200);
    });

    it("should accept team/user/event cal_link format", async () => {
      setupMockDbForGet({ cal_link: "team/user/event" });

      const res = await app.request("/api/admin/settings", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ cal_link: "team/user/event" }),
      });

      expect(res.status).toBe(200);
    });
  });
});
