/**
 * Tests for admin API key management routes.
 *
 * Verifies CRUD operations for API keys per specs/06-api-keys.md.
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

// Mock api-keys module
vi.mock("../../lib/api-keys", () => ({
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  getApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  areValidScopes: vi.fn(() => true),
  VALID_SCOPES: new Set(["leads:read", "leads:write", "leads:delete", "leads:*"]),
}));

// Import after mocking
import { adminApiKeysRoutes } from "./api-keys";
import { errorHandler } from "../../middleware/error-handler";
import {
  validateSession,
  shouldRefreshSession,
  SESSION_CONFIG,
} from "../../lib/session";
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
} from "../../lib/api-keys";
import type { SessionData } from "../../lib/session";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
const mockCreateApiKey = createApiKey as ReturnType<typeof vi.fn>;
const mockListApiKeys = listApiKeys as ReturnType<typeof vi.fn>;
const mockGetApiKey = getApiKey as ReturnType<typeof vi.fn>;
const mockUpdateApiKey = updateApiKey as ReturnType<typeof vi.fn>;
const mockRevokeApiKey = revokeApiKey as ReturnType<typeof vi.fn>;

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

describe("Admin API Keys Routes", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup authenticated session by default
    const mockSession = createMockSession();
    mockValidateSession.mockResolvedValue(mockSession);
    mockShouldRefreshSession.mockReturnValue(false);

    // Create app with routes
    app = new Hono();
    app.route("/api/admin/api-keys", adminApiKeysRoutes);
    app.onError(errorHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET /api/admin/api-keys", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys");

      expect(res.status).toBe(401);
    });

    it("should list all API keys", async () => {
      const mockKeys = [
        {
          id: "key_1",
          name: "Test Key 1",
          keyPrefix: "oct_abc1...",
          scopes: ["leads:read"],
          lastUsedAt: new Date("2025-01-15T10:00:00Z"),
          createdAt: new Date("2025-01-10T10:00:00Z"),
          revokedAt: null,
        },
        {
          id: "key_2",
          name: "Test Key 2",
          keyPrefix: "oct_def2...",
          scopes: ["leads:*"],
          lastUsedAt: null,
          createdAt: new Date("2025-01-12T10:00:00Z"),
          revokedAt: null,
        },
      ];
      mockListApiKeys.mockResolvedValue(mockKeys);

      const res = await app.request("/api/admin/api-keys", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keys).toHaveLength(2);
      expect(body.keys[0]).toMatchObject({
        id: "key_1",
        name: "Test Key 1",
        keyPrefix: "oct_abc1...",
        scopes: ["leads:read"],
      });
      expect(mockListApiKeys).toHaveBeenCalledWith({ includeRevoked: false });
    });

    it("should include revoked keys when requested", async () => {
      mockListApiKeys.mockResolvedValue([]);

      await app.request("/api/admin/api-keys?includeRevoked=true", {
        headers: authHeaders(),
      });

      expect(mockListApiKeys).toHaveBeenCalledWith({ includeRevoked: true });
    });

    it("should format dates as ISO strings", async () => {
      const createdAt = new Date("2025-01-10T10:00:00Z");
      const lastUsedAt = new Date("2025-01-15T10:00:00Z");
      mockListApiKeys.mockResolvedValue([
        {
          id: "key_1",
          name: "Test",
          keyPrefix: "oct_...",
          scopes: [],
          lastUsedAt,
          createdAt,
          revokedAt: null,
        },
      ]);

      const res = await app.request("/api/admin/api-keys", {
        headers: authHeaders(),
      });

      const body = await res.json();
      expect(body.keys[0].createdAt).toBe(createdAt.toISOString());
      expect(body.keys[0].lastUsedAt).toBe(lastUsedAt.toISOString());
    });
  });

  describe("GET /api/admin/api-keys/:id", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/key_123");

      expect(res.status).toBe(401);
    });

    it("should return API key by ID", async () => {
      const mockKey = {
        id: "key_123",
        name: "My API Key",
        keyPrefix: "oct_test...",
        scopes: ["leads:read", "leads:write"],
        lastUsedAt: null,
        createdAt: new Date("2025-01-10T10:00:00Z"),
        revokedAt: null,
      };
      mockGetApiKey.mockResolvedValue(mockKey);

      const res = await app.request("/api/admin/api-keys/key_123", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({
        id: "key_123",
        name: "My API Key",
        keyPrefix: "oct_test...",
        scopes: ["leads:read", "leads:write"],
      });
    });

    it("should return 404 when key not found", async () => {
      mockGetApiKey.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/nonexistent", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("API key not found");
    });
  });

  describe("POST /api/admin/api-keys", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", scopes: ["leads:read"] }),
      });

      expect(res.status).toBe(401);
    });

    it("should return 401 without CSRF header", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Test", scopes: ["leads:read"] }),
      });

      expect(res.status).toBe(401);
    });

    it("should create an API key and return full key", async () => {
      const createdKey = {
        id: "new_key_id",
        name: "New API Key",
        key: "oct_abcdefghij1234567890ABCDEFGHIJ12", // Full key!
        keyPrefix: "oct_abcdefgh...",
        scopes: ["leads:read", "leads:write"],
        createdAt: new Date("2025-01-15T10:00:00Z"),
      };
      mockCreateApiKey.mockResolvedValue(createdKey);

      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          name: "New API Key",
          scopes: ["leads:read", "leads:write"],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({
        id: "new_key_id",
        name: "New API Key",
        key: "oct_abcdefghij1234567890ABCDEFGHIJ12", // Full key shown once!
        keyPrefix: "oct_abcdefgh...",
        scopes: ["leads:read", "leads:write"],
      });
      expect(mockCreateApiKey).toHaveBeenCalledWith({
        name: "New API Key",
        scopes: ["leads:read", "leads:write"],
      });
    });

    it("should validate name is required", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ scopes: ["leads:read"] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.details?.name).toBeDefined();
    });

    it("should validate scopes is required", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "Test Key" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should validate at least one scope is required", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "Test Key", scopes: [] }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should validate scope values", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "Test Key", scopes: ["invalid:scope"] }),
      });

      expect(res.status).toBe(400);
    });

    it("should validate name length", async () => {
      const res = await app.request("/api/admin/api-keys", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          name: "a".repeat(300),
          scopes: ["leads:read"],
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details?.name).toBeDefined();
    });
  });

  describe("PATCH /api/admin/api-keys/:id", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(401);
    });

    it("should return 401 without CSRF header", async () => {
      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(401);
    });

    it("should update API key name", async () => {
      mockGetApiKey.mockResolvedValue({
        id: "key_123",
        name: "Old Name",
        keyPrefix: "oct_...",
        scopes: ["leads:read"],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });
      mockUpdateApiKey.mockResolvedValue({
        id: "key_123",
        name: "New Name",
        keyPrefix: "oct_...",
        scopes: ["leads:read"],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "New Name" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("New Name");
      expect(mockUpdateApiKey).toHaveBeenCalledWith("key_123", {
        name: "New Name",
        scopes: undefined,
      });
    });

    it("should update API key scopes", async () => {
      mockGetApiKey.mockResolvedValue({
        id: "key_123",
        name: "Test Key",
        keyPrefix: "oct_...",
        scopes: ["leads:read"],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });
      mockUpdateApiKey.mockResolvedValue({
        id: "key_123",
        name: "Test Key",
        keyPrefix: "oct_...",
        scopes: ["leads:*"],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: null,
      });

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ scopes: ["leads:*"] }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toEqual(["leads:*"]);
    });

    it("should return 404 when key not found", async () => {
      mockGetApiKey.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/nonexistent", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(res.status).toBe(404);
    });

    it("should return 400 when key is revoked", async () => {
      mockGetApiKey.mockResolvedValue({
        id: "key_123",
        name: "Revoked Key",
        keyPrefix: "oct_...",
        scopes: ["leads:read"],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: new Date(),
      });

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ name: "Try Update" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("revoked");
    });

    it("should return 400 when no fields to update", async () => {
      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/admin/api-keys/:id", () => {
    it("should return 401 when not authenticated", async () => {
      mockValidateSession.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "DELETE",
      });

      expect(res.status).toBe(401);
    });

    it("should return 401 without CSRF header", async () => {
      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "DELETE",
        headers: {
          Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
        },
      });

      expect(res.status).toBe(401);
    });

    it("should revoke API key", async () => {
      mockRevokeApiKey.mockResolvedValue(true);

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "DELETE",
        headers: authHeaders(true),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        message: "API key revoked",
      });
      expect(mockRevokeApiKey).toHaveBeenCalledWith("key_123");
    });

    it("should return 404 when key not found", async () => {
      mockRevokeApiKey.mockResolvedValue(false);
      mockGetApiKey.mockResolvedValue(null);

      const res = await app.request("/api/admin/api-keys/nonexistent", {
        method: "DELETE",
        headers: authHeaders(true),
      });

      expect(res.status).toBe(404);
    });

    it("should return 400 when key already revoked", async () => {
      mockRevokeApiKey.mockResolvedValue(false);
      mockGetApiKey.mockResolvedValue({
        id: "key_123",
        name: "Already Revoked",
        keyPrefix: "oct_...",
        scopes: [],
        lastUsedAt: null,
        createdAt: new Date(),
        revokedAt: new Date(),
      });

      const res = await app.request("/api/admin/api-keys/key_123", {
        method: "DELETE",
        headers: authHeaders(true),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("already revoked");
    });
  });

  describe("GET /api/admin/api-keys/scopes/list", () => {
    it("should return all available scopes", async () => {
      const res = await app.request("/api/admin/api-keys/scopes/list", {
        headers: authHeaders(),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toHaveLength(4);
      expect(body.scopes.map((s: { scope: string }) => s.scope)).toContain("leads:read");
      expect(body.scopes.map((s: { scope: string }) => s.scope)).toContain("leads:write");
      expect(body.scopes.map((s: { scope: string }) => s.scope)).toContain("leads:delete");
      expect(body.scopes.map((s: { scope: string }) => s.scope)).toContain("leads:*");
    });

    it("should include descriptions for each scope", async () => {
      const res = await app.request("/api/admin/api-keys/scopes/list", {
        headers: authHeaders(),
      });

      const body = await res.json();
      for (const scopeInfo of body.scopes) {
        expect(scopeInfo.description).toBeDefined();
        expect(typeof scopeInfo.description).toBe("string");
      }
    });
  });
});
