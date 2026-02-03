/**
 * Tests for API info endpoint (/api/v1/me).
 *
 * Verifies the endpoint returns information about the current API key
 * per specs/07-api-endpoints.md.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Hono } from "hono";
import type { Context, Next } from "hono";

// Mock api-key middleware BEFORE imports
vi.mock("../../middleware/api-key", () => ({
  requireApiKey: vi.fn(),
  requireApiKeyFromContext: vi.fn(),
}));

// Import after mocking
import { meRoutes } from "./me";
import { errorHandler } from "../../middleware/error-handler";
import {
  requireApiKey,
  requireApiKeyFromContext,
} from "../../middleware/api-key";
import { InvalidApiKeyError } from "../../lib/errors";

// Cast to mock types
const mockRequireApiKey = requireApiKey as ReturnType<typeof vi.fn>;
const mockRequireApiKeyFromContext = requireApiKeyFromContext as ReturnType<typeof vi.fn>;

/**
 * Create a mock ValidatedApiKey for testing.
 */
function createMockApiKey(overrides: Partial<{
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
}> = {}) {
  return {
    id: "key_test_123",
    name: "Test API Key",
    keyPrefix: "oct_abc12345...",
    scopes: ["leads:read"],
    lastUsedAt: null,
    createdAt: new Date("2025-01-10T10:00:00Z"),
    ...overrides,
  };
}

describe("API Info Routes (/api/v1/me)", () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: API key middleware passes through and sets a valid key
    const mockApiKey = createMockApiKey();
    mockRequireApiKey.mockImplementation(async (_c: Context, next: Next) => {
      await next();
    });
    mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

    // Create app with routes
    app = new Hono();
    app.route("/api/v1/me", meRoutes);
    app.onError(errorHandler);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("GET /api/v1/me", () => {
    it("should return 401 when no API key is provided", async () => {
      // Mock requireApiKey to throw InvalidApiKeyError (missing key)
      mockRequireApiKey.mockImplementation(async () => {
        throw new InvalidApiKeyError("Missing API key");
      });

      const res = await app.request("/api/v1/me");

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({
        error: "Missing API key",
        code: "INVALID_API_KEY",
      });
    });

    it("should return 401 when API key is invalid", async () => {
      // Mock requireApiKey to throw InvalidApiKeyError (invalid key)
      mockRequireApiKey.mockImplementation(async () => {
        throw new InvalidApiKeyError("Invalid or revoked API key");
      });

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer invalid_key_12345",
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toMatchObject({
        error: "Invalid or revoked API key",
        code: "INVALID_API_KEY",
      });
    });

    it("should return 401 when API key is revoked", async () => {
      // Mock requireApiKey to throw InvalidApiKeyError (revoked key)
      mockRequireApiKey.mockImplementation(async () => {
        throw new InvalidApiKeyError("Invalid or revoked API key");
      });

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_revoked_key_123456",
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("INVALID_API_KEY");
    });

    it("should return API key information with valid key", async () => {
      const mockApiKey = createMockApiKey({
        name: "Production API Key",
        keyPrefix: "oct_prod1234...",
        scopes: ["leads:read", "leads:write"],
        createdAt: new Date("2025-01-15T08:30:00Z"),
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key_123456",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        keyPrefix: "oct_prod1234...",
        name: "Production API Key",
        scopes: ["leads:read", "leads:write"],
        createdAt: "2025-01-15T08:30:00.000Z",
      });
    });

    it("should return keyPrefix field correctly", async () => {
      const mockApiKey = createMockApiKey({
        keyPrefix: "oct_testprefix...",
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.keyPrefix).toBe("oct_testprefix...");
    });

    it("should return name field correctly", async () => {
      const mockApiKey = createMockApiKey({
        name: "My Custom API Key Name",
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("My Custom API Key Name");
    });

    it("should return scopes as an array", async () => {
      const mockApiKey = createMockApiKey({
        scopes: ["leads:read", "leads:write", "leads:delete"],
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.scopes)).toBe(true);
      expect(body.scopes).toEqual(["leads:read", "leads:write", "leads:delete"]);
    });

    it("should return scopes with wildcard scope", async () => {
      const mockApiKey = createMockApiKey({
        scopes: ["leads:*"],
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toEqual(["leads:*"]);
    });

    it("should return empty scopes array if no scopes", async () => {
      const mockApiKey = createMockApiKey({
        scopes: [],
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scopes).toEqual([]);
    });

    it("should return createdAt as ISO string", async () => {
      const createdDate = new Date("2025-06-20T14:45:30.123Z");
      const mockApiKey = createMockApiKey({
        createdAt: createdDate,
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.createdAt).toBe("2025-06-20T14:45:30.123Z");
      // Verify it's a valid ISO date string that can be parsed
      expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
    });

    it("should verify response format matches spec (exactly 4 fields)", async () => {
      const mockApiKey = createMockApiKey();
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();

      // Verify exact fields are present
      const keys = Object.keys(body);
      expect(keys).toHaveLength(4);
      expect(keys).toContain("keyPrefix");
      expect(keys).toContain("name");
      expect(keys).toContain("scopes");
      expect(keys).toContain("createdAt");

      // Verify no extra fields like 'id' or 'lastUsedAt' are exposed
      expect(body.id).toBeUndefined();
      expect(body.lastUsedAt).toBeUndefined();
    });

    it("should not expose sensitive fields like id", async () => {
      const mockApiKey = createMockApiKey({
        id: "key_secret_id_12345",
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeUndefined();
    });

    it("should not expose lastUsedAt field", async () => {
      const mockApiKey = createMockApiKey({
        lastUsedAt: new Date("2025-01-20T12:00:00Z"),
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.lastUsedAt).toBeUndefined();
    });

    it("should return JSON content type", async () => {
      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    it("should handle Authorization header case-insensitively (Bearer vs bearer)", async () => {
      // The actual case handling is in the middleware, but we test that
      // a valid key still works when the middleware passes
      const mockApiKey = createMockApiKey();
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should call requireApiKey middleware", async () => {
      await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(mockRequireApiKey).toHaveBeenCalled();
    });

    it("should call requireApiKeyFromContext to get the API key", async () => {
      await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(mockRequireApiKeyFromContext).toHaveBeenCalled();
    });

    it("should handle API key with special characters in name", async () => {
      const mockApiKey = createMockApiKey({
        name: "API Key with Special Chars: @#$%^&*()",
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("API Key with Special Chars: @#$%^&*()");
    });

    it("should handle API key with unicode characters in name", async () => {
      const mockApiKey = createMockApiKey({
        name: "API Key \u4e2d\u6587 \ud55c\uad6d\uc5b4 \ud83d\ude80",
      });
      mockRequireApiKeyFromContext.mockReturnValue(mockApiKey);

      const res = await app.request("/api/v1/me", {
        headers: {
          Authorization: "Bearer oct_valid_key",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("API Key \u4e2d\u6587 \ud55c\uad6d\uc5b4 \ud83d\ude80");
    });
  });
});
