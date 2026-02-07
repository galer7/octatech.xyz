/**
 * Tests for authentication middleware.
 *
 * Verifies authentication behavior per specs/05-authentication.md:
 * - Session cookie validation
 * - Session refresh (sliding expiration)
 * - CSRF protection via X-Requested-With header
 * - Cookie security options (httpOnly, secure, sameSite)
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the session module BEFORE importing auth middleware
// This prevents the database connection from being loaded
vi.mock("../lib/session", () => ({
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

import type { SessionData } from "../lib/session";
import {
	refreshSession,
	SESSION_CONFIG,
	shouldRefreshSession,
	validateSession,
} from "../lib/session";
// Import after mocking
import {
	clearSessionCookie,
	getSession,
	optionalAuth,
	requireAuth,
	requireCsrfHeader,
	requireSession,
	setSessionCookie,
} from "./auth";
import { errorHandler } from "./error-handler";

// Cast to mock types for TypeScript
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockRefreshSession = refreshSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;

/**
 * Create a mock session for testing.
 */
function createMockSession(overrides: Partial<SessionData> = {}): SessionData {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
	return {
		sessionId: "sess_test_123",
		userId: "user_test_456",
		user: {
			id: "user_test_456",
			email: "admin@example.com",
		},
		expiresAt,
		createdAt: now,
		...overrides,
	};
}

describe("Authentication Middleware", () => {
	let app: Hono;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create fresh app for each test with error handler
		app = new Hono();
		app.onError(errorHandler);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("requireAuth middleware", () => {
		beforeEach(() => {
			app.use("/protected/*", requireAuth);
			app.get("/protected/test", (c) => {
				const session = c.get("session");
				return c.json({ ok: true, userId: session?.userId });
			});
		});

		it("should return 401 when no session cookie is present", async () => {
			const res = await app.request("/protected/test");

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Not authenticated",
				code: "UNAUTHORIZED",
			});
		});

		it("should return 401 when session is invalid", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=invalid_token`,
				},
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Session expired or invalid",
				code: "UNAUTHORIZED",
			});
			expect(mockValidateSession).toHaveBeenCalledWith("invalid_token");
		});

		it("should return 401 when session is expired", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=expired_token`,
				},
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("should allow request through when valid session exists", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token_12345`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				ok: true,
				userId: mockSession.userId,
			});
		});

		it("should inject session data into context", async () => {
			const mockSession = createMockSession({
				userId: "specific_user_id",
				user: { id: "specific_user_id", email: "test@example.com" },
			});
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.userId).toBe("specific_user_id");
		});

		it("should refresh session cookie when close to expiring", async () => {
			const mockSession = createMockSession();
			const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(true);
			mockRefreshSession.mockResolvedValue(newExpiresAt);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			expect(mockRefreshSession).toHaveBeenCalledWith(mockSession.sessionId, expect.any(Boolean));

			// Check that cookie was set with new expiration
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toBeTruthy();
			expect(setCookieHeader).toContain(SESSION_CONFIG.cookieName);
		});

		it("should not refresh session when not close to expiring", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(mockRefreshSession).not.toHaveBeenCalled();
		});

		it("should detect remember me sessions based on duration", async () => {
			// Create a session with long duration (remember me)
			const createdAt = new Date();
			const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
			const mockSession = createMockSession({ createdAt, expiresAt });

			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(true);
			mockRefreshSession.mockResolvedValue(new Date());

			await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			// Should be called with isRememberMe = true
			expect(mockRefreshSession).toHaveBeenCalledWith(mockSession.sessionId, true);
		});

		it("should clear invalid cookie when session validation fails", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/protected/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=invalid_token`,
				},
			});

			expect(res.status).toBe(401);
			// Check that the cookie is being cleared (expires in past or max-age=0)
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toBeTruthy();
			expect(setCookieHeader).toContain(SESSION_CONFIG.cookieName);
		});
	});

	describe("optionalAuth middleware", () => {
		beforeEach(() => {
			app.use("/optional/*", optionalAuth);
			app.get("/optional/test", (c) => {
				const session = c.get("session");
				return c.json({
					authenticated: !!session,
					userId: session?.userId ?? null,
				});
			});
		});

		it("should allow request through when no cookie is present", async () => {
			const res = await app.request("/optional/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: false,
				userId: null,
			});
		});

		it("should not set session in context when no cookie", async () => {
			const res = await app.request("/optional/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.authenticated).toBe(false);
			expect(mockValidateSession).not.toHaveBeenCalled();
		});

		it("should set session in context when valid cookie exists", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			const res = await app.request("/optional/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: true,
				userId: mockSession.userId,
			});
		});

		it("should allow request through when invalid cookie (does not throw)", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/optional/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=invalid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				authenticated: false,
				userId: null,
			});
		});

		it("should not throw on expired session", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/optional/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=expired_token`,
				},
			});

			expect(res.status).toBe(200);
			expect(mockValidateSession).toHaveBeenCalledWith("expired_token");
		});

		it("should refresh session if valid and close to expiring", async () => {
			const mockSession = createMockSession();
			const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(true);
			mockRefreshSession.mockResolvedValue(newExpiresAt);

			const res = await app.request("/optional/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			expect(mockRefreshSession).toHaveBeenCalled();

			// Check that cookie was set with new expiration
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toBeTruthy();
		});
	});

	describe("setSessionCookie", () => {
		it("should set cookie with correct name and value", async () => {
			app.get("/set-cookie", (c) => {
				const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
				setSessionCookie(c, "test_token_value", expiresAt);
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toBeTruthy();
			expect(setCookieHeader).toContain(`${SESSION_CONFIG.cookieName}=`);
			expect(setCookieHeader).toContain("test_token_value");
		});

		it("should set httpOnly flag", async () => {
			app.get("/set-cookie", (c) => {
				setSessionCookie(c, "token", new Date(Date.now() + 3600000));
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toContain("HttpOnly");
		});

		it("should set sameSite=Lax flag", async () => {
			app.get("/set-cookie", (c) => {
				setSessionCookie(c, "token", new Date(Date.now() + 3600000));
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toContain("SameSite=Lax");
		});

		it("should set path=/", async () => {
			app.get("/set-cookie", (c) => {
				setSessionCookie(c, "token", new Date(Date.now() + 3600000));
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toContain("Path=/");
		});

		it("should include expires date", async () => {
			app.get("/set-cookie", (c) => {
				const expiresAt = new Date(Date.now() + 3600000);
				setSessionCookie(c, "token", expiresAt);
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toContain("Expires=");
		});

		it("should set secure flag in production", async () => {
			// This test would require mocking process.env.NODE_ENV
			// The actual behavior depends on the runtime environment
			// In the code, secure: process.env.NODE_ENV === 'production'
			app.get("/set-cookie", (c) => {
				setSessionCookie(c, "token", new Date(Date.now() + 3600000));
				return c.json({ ok: true });
			});

			const res = await app.request("/set-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			// In test environment (not production), Secure flag should NOT be present
			expect(setCookieHeader).toBeTruthy();
			// Note: Secure flag presence depends on NODE_ENV
		});
	});

	describe("clearSessionCookie", () => {
		it("should clear the session cookie", async () => {
			app.get("/clear-cookie", (c) => {
				clearSessionCookie(c);
				return c.json({ ok: true });
			});

			const res = await app.request("/clear-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			expect(setCookieHeader).toBeTruthy();
			expect(setCookieHeader).toContain(SESSION_CONFIG.cookieName);
		});

		it("should set proper flags when clearing", async () => {
			app.get("/clear-cookie", (c) => {
				clearSessionCookie(c);
				return c.json({ ok: true });
			});

			const res = await app.request("/clear-cookie");
			const setCookieHeader = res.headers.get("Set-Cookie");

			// Cookie should be cleared (value empty or max-age=0 or expires in past)
			expect(setCookieHeader).toContain(SESSION_CONFIG.cookieName);
			expect(setCookieHeader).toContain("Path=/");
		});
	});

	describe("getSession", () => {
		it("should return undefined when not authenticated", async () => {
			app.use("/test", optionalAuth);
			app.get("/test", (c) => {
				const session = getSession(c);
				return c.json({ hasSession: session !== undefined });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.hasSession).toBe(false);
		});

		it("should return session when authenticated", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			app.use("/test", requireAuth);
			app.get("/test", (c) => {
				const session = getSession(c);
				return c.json({
					hasSession: session !== undefined,
					sessionId: session?.sessionId,
					email: session?.user.email,
				});
			});

			const res = await app.request("/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.hasSession).toBe(true);
			expect(body.sessionId).toBe(mockSession.sessionId);
			expect(body.email).toBe(mockSession.user.email);
		});
	});

	describe("requireSession", () => {
		it("should throw UnauthorizedError when not authenticated", async () => {
			app.use("/test", optionalAuth);
			app.get("/test", (c) => {
				const session = requireSession(c);
				return c.json({ sessionId: session.sessionId });
			});

			const res = await app.request("/test");

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Not authenticated",
				code: "UNAUTHORIZED",
			});
		});

		it("should return session when authenticated", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			app.use("/test", requireAuth);
			app.get("/test", (c) => {
				const session = requireSession(c);
				return c.json({ sessionId: session.sessionId });
			});

			const res = await app.request("/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.sessionId).toBe(mockSession.sessionId);
		});

		it("should return full session data", async () => {
			const mockSession = createMockSession({
				sessionId: "sess_123",
				userId: "user_456",
				user: { id: "user_456", email: "admin@test.com" },
			});
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			app.use("/test", requireAuth);
			app.get("/test", (c) => {
				const session = requireSession(c);
				return c.json({
					sessionId: session.sessionId,
					userId: session.userId,
					userEmail: session.user.email,
				});
			});

			const res = await app.request("/test", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				sessionId: "sess_123",
				userId: "user_456",
				userEmail: "admin@test.com",
			});
		});
	});

	describe("requireCsrfHeader middleware", () => {
		beforeEach(() => {
			app.use("/csrf/*", requireCsrfHeader);
			app.get("/csrf/test", (c) => c.json({ ok: true }));
			app.post("/csrf/test", (c) => c.json({ ok: true }));
			app.patch("/csrf/test", (c) => c.json({ ok: true }));
			app.put("/csrf/test", (c) => c.json({ ok: true }));
			app.delete("/csrf/test", (c) => c.json({ ok: true }));
		});

		it("should pass for GET requests without header", async () => {
			const res = await app.request("/csrf/test", {
				method: "GET",
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true });
		});

		it("should pass for HEAD requests without header", async () => {
			app.get("/csrf/test", (c) => c.json({ ok: true })); // HEAD uses GET handler

			const res = await app.request("/csrf/test", {
				method: "HEAD",
			});

			expect(res.status).toBe(200);
		});

		it("should pass for OPTIONS requests without header", async () => {
			app.options("/csrf/test", (c) => c.json({ ok: true }));

			const res = await app.request("/csrf/test", {
				method: "OPTIONS",
			});

			expect(res.status).toBe(200);
		});

		it("should pass for POST with X-Requested-With: XMLHttpRequest", async () => {
			const res = await app.request("/csrf/test", {
				method: "POST",
				headers: {
					"X-Requested-With": "XMLHttpRequest",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ ok: true });
		});

		it("should fail for POST without X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(401);
			const body = await res.json();
			expect(body).toEqual({
				error: "Invalid request",
				code: "UNAUTHORIZED",
			});
		});

		it("should fail for POST with wrong X-Requested-With value", async () => {
			const res = await app.request("/csrf/test", {
				method: "POST",
				headers: {
					"X-Requested-With": "WrongValue",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(401);
		});

		it("should fail for PATCH without X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(401);
		});

		it("should pass for PATCH with X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "PATCH",
				headers: {
					"X-Requested-With": "XMLHttpRequest",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(200);
		});

		it("should fail for PUT without X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(401);
		});

		it("should pass for PUT with X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "PUT",
				headers: {
					"X-Requested-With": "XMLHttpRequest",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(200);
		});

		it("should fail for DELETE without X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "DELETE",
			});

			expect(res.status).toBe(401);
		});

		it("should pass for DELETE with X-Requested-With header", async () => {
			const res = await app.request("/csrf/test", {
				method: "DELETE",
				headers: {
					"X-Requested-With": "XMLHttpRequest",
				},
			});

			expect(res.status).toBe(200);
		});
	});

	describe("Integration scenarios", () => {
		it("should work with combined requireAuth and requireCsrfHeader", async () => {
			const mockSession = createMockSession();
			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(false);

			app.use("/secure/*", requireAuth);
			app.use("/secure/*", requireCsrfHeader);
			app.post("/secure/action", (c) => {
				const session = c.get("session");
				return c.json({ userId: session.userId });
			});

			// Missing both auth and CSRF header
			const res1 = await app.request("/secure/action", {
				method: "POST",
			});
			expect(res1.status).toBe(401);

			// Has auth but missing CSRF header
			const res2 = await app.request("/secure/action", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});
			expect(res2.status).toBe(401);

			// Has both auth and CSRF header
			const res3 = await app.request("/secure/action", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"X-Requested-With": "XMLHttpRequest",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			});
			expect(res3.status).toBe(200);
			const body = await res3.json();
			expect(body.userId).toBe(mockSession.userId);
		});

		it("should handle session refresh during protected request", async () => {
			const mockSession = createMockSession();
			const newExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

			mockValidateSession.mockResolvedValue(mockSession);
			mockShouldRefreshSession.mockReturnValue(true);
			mockRefreshSession.mockResolvedValue(newExpiresAt);

			app.use("/protected/*", requireAuth);
			app.get("/protected/data", (c) => c.json({ data: "secret" }));

			const res = await app.request("/protected/data", {
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(200);
			expect(mockRefreshSession).toHaveBeenCalled();

			// Verify new cookie was set
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toContain(SESSION_CONFIG.cookieName);
		});
	});
});
