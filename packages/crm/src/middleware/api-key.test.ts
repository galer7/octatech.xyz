/**
 * Tests for API key authentication middleware.
 *
 * Verifies Bearer token extraction, key validation, and scope checking
 * per specs/06-api-keys.md.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api-keys module BEFORE importing middleware
vi.mock("../lib/api-keys", () => ({
	validateApiKey: vi.fn(),
	hasScope: vi.fn((scopes: string[], required: string) => {
		// Simple implementation for testing
		const [resource] = required.split(":");
		return scopes.some((scope) => scope === required || scope === `${resource}:*` || scope === "*");
	}),
}));

import type { ValidatedApiKey } from "../lib/api-keys";
import { hasScope, validateApiKey } from "../lib/api-keys";
// Import after mocking
import {
	extractBearerToken,
	getApiKeyFromContext,
	getRateLimitIdentifier,
	hasCurrentScope,
	optionalApiKey,
	requireApiKey,
	requireApiKeyFromContext,
	requireScope,
} from "./api-key";
import { errorHandler } from "./error-handler";

// Cast to mock types for TypeScript
const mockValidateApiKey = validateApiKey as ReturnType<typeof vi.fn>;
const mockHasScope = hasScope as ReturnType<typeof vi.fn>;

/**
 * Create a mock validated API key for testing.
 */
function createMockApiKey(overrides: Partial<ValidatedApiKey> = {}): ValidatedApiKey {
	return {
		id: "key_test_123",
		name: "Test API Key",
		keyPrefix: "oct_test1234...",
		scopes: ["leads:read", "leads:write"],
		lastUsedAt: null,
		createdAt: new Date(),
		...overrides,
	};
}

describe("API Key Middleware", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();
		app = new Hono();
		app.onError(errorHandler);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("extractBearerToken", () => {
		it("should extract token from valid Bearer header", async () => {
			let extractedToken: string | null = null;

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_testtoken1234567890123456",
				},
			});

			expect(extractedToken).toBe("oct_testtoken1234567890123456");
		});

		it("should return null for missing Authorization header", async () => {
			let extractedToken: string | null = "initial";

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test");

			expect(extractedToken).toBeNull();
		});

		it("should return null for non-Bearer auth", async () => {
			let extractedToken: string | null = "initial";

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "Basic dXNlcjpwYXNz",
				},
			});

			expect(extractedToken).toBeNull();
		});

		it("should handle case-insensitive Bearer prefix", async () => {
			let extractedToken: string | null = null;

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "bearer oct_testtoken1234567890123456",
				},
			});

			expect(extractedToken).toBe("oct_testtoken1234567890123456");
		});

		it("should handle BEARER (uppercase) prefix", async () => {
			let extractedToken: string | null = null;

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "BEARER oct_testtoken1234567890123456",
				},
			});

			expect(extractedToken).toBe("oct_testtoken1234567890123456");
		});

		it("should return null for empty Bearer token", async () => {
			let extractedToken: string | null = "initial";

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "Bearer ",
				},
			});

			expect(extractedToken).toBeNull();
		});

		it("should trim whitespace from token", async () => {
			let extractedToken: string | null = null;

			app.get("/test", (c) => {
				extractedToken = extractBearerToken(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "Bearer   oct_testtoken123   ",
				},
			});

			expect(extractedToken).toBe("oct_testtoken123");
		});
	});

	describe("requireApiKey middleware", () => {
		beforeEach(() => {
			app.use("/api/*", requireApiKey);
			app.get("/api/test", (c) => {
				const apiKey = c.get("apiKey");
				return c.json({ ok: true, keyName: apiKey?.name });
			});
		});

		it("should return 401 when no Authorization header", async () => {
			const res = await app.request("/api/test");

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Missing API key",
				code: "INVALID_API_KEY",
			});
		});

		it("should return 401 when API key is invalid", async () => {
			mockValidateApiKey.mockResolvedValue(null);

			const res = await app.request("/api/test", {
				headers: {
					Authorization: "Bearer oct_invalidkey12345678901234",
				},
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Invalid or revoked API key",
				code: "INVALID_API_KEY",
			});
		});

		it("should allow request through when valid API key", async () => {
			const mockApiKey = createMockApiKey({ name: "Test Key" });
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			const res = await app.request("/api/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true, keyName: "Test Key" });
		});

		it("should inject API key data into context", async () => {
			const mockApiKey = createMockApiKey({
				id: "specific_key_id",
				name: "Specific Key",
				scopes: ["leads:*"],
			});
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			const res = await app.request("/api/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.keyName).toBe("Specific Key");
		});

		it("should validate the extracted token", async () => {
			mockValidateApiKey.mockResolvedValue(null);

			await app.request("/api/test", {
				headers: {
					Authorization: "Bearer oct_myspecialtoken123456789012",
				},
			});

			expect(mockValidateApiKey).toHaveBeenCalledWith("oct_myspecialtoken123456789012");
		});
	});

	describe("requireScope middleware", () => {
		beforeEach(() => {
			app.use("/api/*", requireApiKey);
		});

		it("should allow request when API key has required scope", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:read"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockReturnValue(true);

			app.get("/api/leads", requireScope("leads:read"), (c) => {
				return c.json({ ok: true });
			});

			const res = await app.request("/api/leads", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
		});

		it("should return 403 when API key lacks required scope", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:read"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockReturnValue(false);

			app.post("/api/leads", requireScope("leads:write"), (c) => {
				return c.json({ ok: true });
			});

			const res = await app.request("/api/leads", {
				method: "POST",
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(403);
			const body = await res.json();
			expect(body.code).toBe("INSUFFICIENT_SCOPE");
			expect(body.error).toContain("leads:write");
		});

		it("should allow with wildcard scope", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:*"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockReturnValue(true);

			app.delete("/api/leads/:id", requireScope("leads:delete"), (c) => {
				return c.json({ ok: true });
			});

			const res = await app.request("/api/leads/123", {
				method: "DELETE",
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
		});

		it("should return 401 if no API key in context", async () => {
			// Skip requireApiKey middleware to test edge case
			const directApp = new Hono();
			directApp.onError(errorHandler);
			directApp.get("/test", requireScope("leads:read"), (c) => {
				return c.json({ ok: true });
			});

			const res = await directApp.request("/test");

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.code).toBe("INVALID_API_KEY");
		});
	});

	describe("optionalApiKey middleware", () => {
		beforeEach(() => {
			app.use("/optional/*", optionalApiKey);
			app.get("/optional/test", (c) => {
				const apiKey = c.get("apiKey");
				return c.json({
					authenticated: !!apiKey,
					keyName: apiKey?.name ?? null,
				});
			});
		});

		it("should allow request without API key", async () => {
			const res = await app.request("/optional/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: false,
				keyName: null,
			});
		});

		it("should set API key in context when valid", async () => {
			const mockApiKey = createMockApiKey({ name: "Optional Key" });
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			const res = await app.request("/optional/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: true,
				keyName: "Optional Key",
			});
		});

		it("should allow request through with invalid key (does not throw)", async () => {
			mockValidateApiKey.mockResolvedValue(null);

			const res = await app.request("/optional/test", {
				headers: {
					Authorization: "Bearer oct_invalidkey12345678901234",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: false,
				keyName: null,
			});
		});
	});

	describe("getApiKeyFromContext", () => {
		it("should return undefined when not authenticated", async () => {
			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				const apiKey = getApiKeyFromContext(c);
				return c.json({ hasKey: apiKey !== undefined });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.hasKey).toBe(false);
		});

		it("should return API key when authenticated", async () => {
			const mockApiKey = createMockApiKey({ id: "key_123" });
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			app.use("/test", requireApiKey);
			app.get("/test", (c) => {
				const apiKey = getApiKeyFromContext(c);
				return c.json({
					hasKey: apiKey !== undefined,
					keyId: apiKey?.id,
				});
			});

			const res = await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				hasKey: true,
				keyId: "key_123",
			});
		});
	});

	describe("requireApiKeyFromContext", () => {
		it("should throw when not authenticated", async () => {
			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				const apiKey = requireApiKeyFromContext(c);
				return c.json({ keyId: apiKey.id });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.code).toBe("INVALID_API_KEY");
		});

		it("should return API key when authenticated", async () => {
			const mockApiKey = createMockApiKey({ id: "key_456" });
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			app.use("/test", requireApiKey);
			app.get("/test", (c) => {
				const apiKey = requireApiKeyFromContext(c);
				return c.json({ keyId: apiKey.id });
			});

			const res = await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.keyId).toBe("key_456");
		});
	});

	describe("hasCurrentScope", () => {
		it("should return false when not authenticated", async () => {
			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				const canRead = hasCurrentScope(c, "leads:read");
				return c.json({ canRead });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.canRead).toBe(false);
		});

		it("should check scope when authenticated", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:read"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockImplementation((scopes, required) => {
				return scopes.includes(required);
			});

			app.use("/test", requireApiKey);
			app.get("/test", (c) => {
				const canRead = hasCurrentScope(c, "leads:read");
				const canWrite = hasCurrentScope(c, "leads:write");
				return c.json({ canRead, canWrite });
			});

			const res = await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.canRead).toBe(true);
			expect(body.canWrite).toBe(false);
		});
	});

	describe("getRateLimitIdentifier", () => {
		it("should return API key prefix when authenticated", async () => {
			const mockApiKey = createMockApiKey({ keyPrefix: "oct_abc123..." });
			mockValidateApiKey.mockResolvedValue(mockApiKey);

			let identifier: string = "";

			app.use("/test", requireApiKey);
			app.get("/test", (c) => {
				identifier = getRateLimitIdentifier(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});

			expect(identifier).toBe("apikey:oct_abc123...");
		});

		it("should return IP when not authenticated", async () => {
			let identifier: string = "";

			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				identifier = getRateLimitIdentifier(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					"X-Real-IP": "192.168.1.100",
				},
			});

			expect(identifier).toBe("ip:192.168.1.100");
		});

		it("should prefer CF-Connecting-IP for Cloudflare", async () => {
			let identifier: string = "";

			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				identifier = getRateLimitIdentifier(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					"CF-Connecting-IP": "1.2.3.4",
					"X-Real-IP": "5.6.7.8",
					"X-Forwarded-For": "9.10.11.12",
				},
			});

			expect(identifier).toBe("ip:1.2.3.4");
		});

		it("should use first X-Forwarded-For IP", async () => {
			let identifier: string = "";

			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				identifier = getRateLimitIdentifier(c);
				return c.json({ ok: true });
			});

			await app.request("/test", {
				headers: {
					"X-Forwarded-For": "203.0.113.1, 70.41.3.18, 150.172.238.178",
				},
			});

			expect(identifier).toBe("ip:203.0.113.1");
		});

		it("should return 'ip:unknown' when no IP headers", async () => {
			let identifier: string = "";

			app.use("/test", optionalApiKey);
			app.get("/test", (c) => {
				identifier = getRateLimitIdentifier(c);
				return c.json({ ok: true });
			});

			await app.request("/test");

			expect(identifier).toBe("ip:unknown");
		});
	});

	describe("Integration scenarios", () => {
		it("should work with combined requireApiKey and requireScope", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:read"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockImplementation((scopes, required) => {
				return scopes.includes(required) || scopes.includes("leads:*");
			});

			app.use("/api/*", requireApiKey);
			app.get("/api/leads", requireScope("leads:read"), (c) => {
				return c.json({ data: "leads" });
			});
			app.post("/api/leads", requireScope("leads:write"), (c) => {
				return c.json({ created: true });
			});

			// Should succeed - has leads:read
			const res1 = await app.request("/api/leads", {
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
				},
			});
			expect(res1.status).toBe(200);

			// Should fail - doesn't have leads:write
			const res2 = await app.request("/api/leads", {
				method: "POST",
				headers: {
					Authorization: "Bearer oct_validkey123456789012345678",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});
			expect(res2.status).toBe(403);
		});

		it("should handle wildcard scope for all operations", async () => {
			const mockApiKey = createMockApiKey({ scopes: ["leads:*"] });
			mockValidateApiKey.mockResolvedValue(mockApiKey);
			mockHasScope.mockReturnValue(true);

			app.use("/api/*", requireApiKey);
			app.get("/api/leads", requireScope("leads:read"), (c) => c.json({ ok: true }));
			app.post("/api/leads", requireScope("leads:write"), (c) => c.json({ ok: true }));
			app.delete("/api/leads/:id", requireScope("leads:delete"), (c) => c.json({ ok: true }));

			const authHeader = { Authorization: "Bearer oct_validkey123456789012345678" };

			const res1 = await app.request("/api/leads", { headers: authHeader });
			expect(res1.status).toBe(200);

			const res2 = await app.request("/api/leads", {
				method: "POST",
				headers: { ...authHeader, "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			expect(res2.status).toBe(200);

			const res3 = await app.request("/api/leads/123", {
				method: "DELETE",
				headers: authHeader,
			});
			expect(res3.status).toBe(200);
		});
	});
});
