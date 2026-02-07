/**
 * Tests for authentication routes.
 *
 * Verifies:
 * - POST /login - email/password authentication
 * - POST /logout - session termination
 * - GET /me - current user retrieval
 * - POST /change-password - password change
 *
 * Per specs/05-authentication.md
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitStore } from "../middleware/rate-limit";
import { authRoutes, clearFailedAttemptsStore, getFailedAttemptsCount } from "./auth";

// Mock the database module
vi.mock("../db", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}));

// Mock session functions
vi.mock("../lib/session", () => ({
	SESSION_CONFIG: {
		cookieName: "session",
		defaultDurationMs: 24 * 60 * 60 * 1000,
		rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
	},
	createSession: vi.fn(),
	deleteSessionByToken: vi.fn(),
	deleteUserSessions: vi.fn(),
	updateLastLogin: vi.fn(),
	validateSession: vi.fn(),
	refreshSession: vi.fn(),
	shouldRefreshSession: vi.fn(),
}));

// Mock password functions
vi.mock("../lib/password", () => ({
	hashPassword: vi.fn(),
	verifyPassword: vi.fn(),
	validatePasswordStrength: vi.fn(),
}));

// Import mocked modules
import { db } from "../db";
import { hashPassword, validatePasswordStrength, verifyPassword } from "../lib/password";
import {
	createSession,
	deleteSessionByToken,
	deleteUserSessions,
	updateLastLogin,
	validateSession,
} from "../lib/session";

/**
 * Create a test app with auth routes and error handling
 */
function createTestApp() {
	const app = new Hono();

	// Add error handling middleware
	app.onError((err, c) => {
		if (err.name === "ValidationError") {
			return c.json(
				{
					error: err.message,
					code: "VALIDATION_ERROR",
					details: (err as any).details,
				},
				400,
			);
		}
		if (err.name === "UnauthorizedError") {
			return c.json({ error: err.message, code: "UNAUTHORIZED" }, 401);
		}
		if (err.name === "BadRequestError") {
			return c.json({ error: err.message, code: "BAD_REQUEST" }, 400);
		}
		if (err.name === "RateLimitedError") {
			return c.json(
				{
					error: "Rate limit exceeded",
					code: "RATE_LIMITED",
					retryAfter: (err as any).retryAfter,
				},
				429,
			);
		}
		return c.json({ error: "Internal server error" }, 500);
	});

	app.route("/api/auth", authRoutes);
	return app;
}

describe("Auth Routes", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();
		clearFailedAttemptsStore();
		clearRateLimitStore();
		app = createTestApp();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("POST /api/auth/login", () => {
		const mockUser = {
			id: "user-123",
			email: "admin@octatech.xyz",
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$hash",
			createdAt: new Date(),
			lastLoginAt: null,
		};

		const mockSession = {
			sessionId: "session-123",
			userId: "user-123",
			user: { id: "user-123", email: "admin@octatech.xyz" },
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			createdAt: new Date(),
		};

		it("should return user and set cookie on successful login", async () => {
			// Mock database query chain for finding user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password verification
			(verifyPassword as any).mockResolvedValue(true);

			// Mock session creation
			(createSession as any).mockResolvedValue({
				token: "test-session-token",
				session: mockSession,
			});

			// Mock last login update
			(updateLastLogin as any).mockResolvedValue(undefined);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "SecurePassword123!",
				}),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.user).toEqual({
				id: "user-123",
				email: "admin@octatech.xyz",
			});

			// Check that session cookie is set
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toContain("session=");
			expect(setCookieHeader).toContain("HttpOnly");
			expect(setCookieHeader).toContain("Path=/");
		});

		it("should return 401 for invalid email/password", async () => {
			// Mock database returning no user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password verification (should still be called for timing safety)
			(verifyPassword as any).mockResolvedValue(false);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "wrong@email.com",
					password: "WrongPassword123!",
				}),
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("Invalid email or password");

			// Should not reveal if email exists - error message is generic
			expect(body.error).not.toContain("not found");
			expect(body.error).not.toContain("does not exist");
			expect(body.error).not.toContain("unknown");
		});

		it("should return 401 for correct email but wrong password", async () => {
			// Mock database returning user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password verification failing
			(verifyPassword as any).mockResolvedValue(false);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "WrongPassword123!",
				}),
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toBe("Invalid email or password");
		});

		it("should return 423 account lockout after 5 failed attempts", async () => {
			// Clear rate limit store to ensure we don't hit rate limiting first
			clearRateLimitStore();

			// Mock database returning user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password verification always failing
			(verifyPassword as any).mockResolvedValue(false);

			// Make 5 failed attempts - use different IPs to avoid rate limiting
			// Account lockout is tracked by email, rate limiting is tracked by IP
			for (let i = 0; i < 5; i++) {
				clearRateLimitStore(); // Clear rate limit between attempts
				const res = await app.request("/api/auth/login", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": `192.168.1.${i + 1}`,
					},
					body: JSON.stringify({
						email: "admin@octatech.xyz",
						password: "WrongPassword123!",
					}),
				});
				expect(res.status).toBe(401);
			}

			// 6th attempt should be locked (account lockout, not rate limit)
			clearRateLimitStore(); // Clear rate limit
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": "192.168.1.100",
				},
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "WrongPassword123!",
				}),
			});

			expect(res.status).toBe(423);

			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.error).toContain("Account locked");
			expect(body.error).toContain("minute");
		});

		it("should return validation error for missing email", async () => {
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					password: "SecurePassword123!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should return validation error for missing password", async () => {
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should return validation error for invalid email format", async () => {
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "not-an-email",
					password: "SecurePassword123!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should return validation error for empty request body", async () => {
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should track failed attempts correctly", async () => {
			// Mock database returning user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password verification failing
			(verifyPassword as any).mockResolvedValue(false);

			// Make 3 failed attempts
			for (let i = 0; i < 3; i++) {
				await app.request("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "admin@octatech.xyz",
						password: "WrongPassword123!",
					}),
				});
			}

			expect(getFailedAttemptsCount("admin@octatech.xyz")).toBe(3);
		});

		it("should clear failed attempts on successful login", async () => {
			// First, make some failed attempts
			const mockSelectNoUser = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelectNoUser);
			(verifyPassword as any).mockResolvedValue(false);

			// Make 2 failed attempts
			for (let i = 0; i < 2; i++) {
				await app.request("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: "admin@octatech.xyz",
						password: "WrongPassword123!",
					}),
				});
			}

			expect(getFailedAttemptsCount("admin@octatech.xyz")).toBe(2);

			// Now successful login
			(verifyPassword as any).mockResolvedValue(true);
			(createSession as any).mockResolvedValue({
				token: "test-session-token",
				session: mockSession,
			});
			(updateLastLogin as any).mockResolvedValue(undefined);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "SecurePassword123!",
				}),
			});

			expect(res.status).toBe(200);
			expect(getFailedAttemptsCount("admin@octatech.xyz")).toBe(0);
		});

		it("should handle rememberMe option", async () => {
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);
			(verifyPassword as any).mockResolvedValue(true);
			(createSession as any).mockResolvedValue({
				token: "test-session-token",
				session: mockSession,
			});
			(updateLastLogin as any).mockResolvedValue(undefined);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "SecurePassword123!",
					rememberMe: true,
				}),
			});

			expect(res.status).toBe(200);

			// Verify createSession was called with rememberMe option
			expect(createSession).toHaveBeenCalledWith(
				"user-123",
				expect.objectContaining({ rememberMe: true }),
			);
		});

		it("should return 429 after rate limit exceeded (5 requests in 15 minutes)", async () => {
			// Make 5 requests (the rate limit for login)
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);
			(verifyPassword as any).mockResolvedValue(false);

			for (let i = 0; i < 5; i++) {
				await app.request("/api/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email: `attempt${i}@email.com`,
						password: "Password123!",
					}),
				});
			}

			// 6th request should be rate limited
			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "another@email.com",
					password: "Password123!",
				}),
			});

			expect(res.status).toBe(429);

			const body = await res.json();
			expect(body.code).toBe("RATE_LIMITED");
		});

		it("should include rate limit headers in response", async () => {
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);
			(verifyPassword as any).mockResolvedValue(false);

			const res = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "test@email.com",
					password: "Password123!",
				}),
			});

			expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
			expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
			expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
		});
	});

	describe("POST /api/auth/logout", () => {
		it("should successfully clear session and cookie", async () => {
			(deleteSessionByToken as any).mockResolvedValue(true);

			const res = await app.request("/api/auth/logout", {
				method: "POST",
				headers: {
					Cookie: "session=test-token",
				},
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);

			// Verify deleteSessionByToken was called
			expect(deleteSessionByToken).toHaveBeenCalledWith("test-token");

			// Check that cookie is cleared
			const setCookieHeader = res.headers.get("Set-Cookie");
			expect(setCookieHeader).toContain("session=");
		});

		it("should work without cookie (idempotent)", async () => {
			const res = await app.request("/api/auth/logout", {
				method: "POST",
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);

			// deleteSessionByToken should not be called without a token
			expect(deleteSessionByToken).not.toHaveBeenCalled();
		});

		it("should handle multiple logout calls gracefully", async () => {
			(deleteSessionByToken as any).mockResolvedValue(false);

			// First logout
			const res1 = await app.request("/api/auth/logout", {
				method: "POST",
				headers: {
					Cookie: "session=test-token",
				},
			});
			expect(res1.status).toBe(200);

			// Second logout (session already deleted)
			const res2 = await app.request("/api/auth/logout", {
				method: "POST",
				headers: {
					Cookie: "session=test-token",
				},
			});
			expect(res2.status).toBe(200);

			const body = await res2.json();
			expect(body.success).toBe(true);
		});
	});

	describe("GET /api/auth/me", () => {
		const mockSession = {
			sessionId: "session-123",
			userId: "user-123",
			user: { id: "user-123", email: "admin@octatech.xyz" },
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			createdAt: new Date(),
		};

		it("should return user when authenticated", async () => {
			(validateSession as any).mockResolvedValue(mockSession);

			const res = await app.request("/api/auth/me", {
				method: "GET",
				headers: {
					Cookie: "session=valid-token",
				},
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.user).toEqual({
				id: "user-123",
				email: "admin@octatech.xyz",
			});
		});

		it("should return 401 when not authenticated (no cookie)", async () => {
			const res = await app.request("/api/auth/me", {
				method: "GET",
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
			expect(body.error).toBe("Not authenticated");
		});

		it("should return 401 when session is invalid", async () => {
			(validateSession as any).mockResolvedValue(null);

			const res = await app.request("/api/auth/me", {
				method: "GET",
				headers: {
					Cookie: "session=invalid-token",
				},
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("should return 401 when session is expired", async () => {
			(validateSession as any).mockResolvedValue(null);

			const res = await app.request("/api/auth/me", {
				method: "GET",
				headers: {
					Cookie: "session=expired-token",
				},
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
		});
	});

	describe("POST /api/auth/change-password", () => {
		const mockSession = {
			sessionId: "session-123",
			userId: "user-123",
			user: { id: "user-123", email: "admin@octatech.xyz" },
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
			createdAt: new Date(),
		};

		const mockUser = {
			id: "user-123",
			email: "admin@octatech.xyz",
			passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$oldhash",
			createdAt: new Date(),
			lastLoginAt: null,
		};

		beforeEach(() => {
			// Setup authenticated session for change-password tests
			(validateSession as any).mockResolvedValue(mockSession);
		});

		it("should succeed with valid current password and strong new password", async () => {
			// Mock database query for getting user
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password operations
			(verifyPassword as any)
				.mockResolvedValueOnce(true) // Current password is correct
				.mockResolvedValueOnce(false); // New password is different

			(validatePasswordStrength as any).mockReturnValue({
				valid: true,
				errors: [],
			});

			(hashPassword as any).mockResolvedValue("$argon2id$v=19$m=65536,t=3,p=4$newhash");

			// Mock database update
			const mockUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "user-123" }]),
				}),
			});
			(db.update as any).mockImplementation(mockUpdate);

			(deleteUserSessions as any).mockResolvedValue(1);

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(200);

			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.message).toBe("Password updated successfully");
		});

		it("should fail with incorrect current password", async () => {
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			// Mock password validation passing but verification failing
			(validatePasswordStrength as any).mockReturnValue({
				valid: true,
				errors: [],
			});
			(verifyPassword as any).mockResolvedValue(false);

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "WrongPassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("BAD_REQUEST");
			expect(body.error).toBe("Current password is incorrect");
		});

		it("should fail with weak new password", async () => {
			(validatePasswordStrength as any).mockReturnValue({
				valid: false,
				errors: ["Password must be at least 12 characters long"],
			});

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "weak",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should require authentication", async () => {
			(validateSession as any).mockResolvedValue(null);

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
		});

		it("should require CSRF header (X-Requested-With)", async () => {
			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					// Missing X-Requested-With header
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.error).toBe("Invalid request");
		});

		it("should invalidate other sessions after password change", async () => {
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			(verifyPassword as any).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

			(validatePasswordStrength as any).mockReturnValue({
				valid: true,
				errors: [],
			});

			(hashPassword as any).mockResolvedValue("$argon2id$v=19$newhash");

			const mockUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([{ id: "user-123" }]),
				}),
			});
			(db.update as any).mockImplementation(mockUpdate);

			(deleteUserSessions as any).mockResolvedValue(2);

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(200);

			// Verify deleteUserSessions was called with correct params
			expect(deleteUserSessions).toHaveBeenCalledWith("user-123", "session-123");
		});

		it("should fail if new password is same as current password", async () => {
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			(validatePasswordStrength as any).mockReturnValue({
				valid: true,
				errors: [],
			});

			// Both verifications return true (password matches for both checks)
			(verifyPassword as any)
				.mockResolvedValueOnce(true) // Current password correct
				.mockResolvedValueOnce(true); // New password same as current

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "SamePassword123!",
					newPassword: "SamePassword123!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.error).toContain("different from current password");
		});

		it("should return validation error for missing currentPassword", async () => {
			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should return validation error for missing newPassword", async () => {
			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
				}),
			});

			expect(res.status).toBe(400);

			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
		});

		it("should return 401 if user not found in database", async () => {
			// Mock user not found
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);

			(validatePasswordStrength as any).mockReturnValue({
				valid: true,
				errors: [],
			});

			const res = await app.request("/api/auth/change-password", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: "session=valid-token",
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					currentPassword: "OldSecurePassword123!",
					newPassword: "NewSecurePassword456!",
				}),
			});

			expect(res.status).toBe(401);

			const body = await res.json();
			expect(body.code).toBe("UNAUTHORIZED");
			expect(body.error).toBe("User not found");
		});
	});

	describe("Security considerations", () => {
		it("should not reveal if email exists (timing-safe error messages)", async () => {
			// Test with non-existent email
			const mockSelectNoUser = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelectNoUser);
			(verifyPassword as any).mockResolvedValue(false);

			const res1 = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "nonexistent@email.com",
					password: "SomePassword123!",
				}),
			});

			// Test with existing email but wrong password
			const mockUser = {
				id: "user-123",
				email: "admin@octatech.xyz",
				passwordHash: "$argon2id$hash",
				createdAt: new Date(),
				lastLoginAt: null,
			};
			const mockSelectUser = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelectUser);

			const res2 = await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "WrongPassword123!",
				}),
			});

			const body1 = await res1.json();
			const body2 = await res2.json();

			// Both should return the same error message
			expect(body1.error).toBe(body2.error);
			expect(body1.error).toBe("Invalid email or password");
		});

		it("should handle case-insensitive email for lockout tracking", async () => {
			const mockUser = {
				id: "user-123",
				email: "admin@octatech.xyz",
				passwordHash: "$argon2id$hash",
				createdAt: new Date(),
				lastLoginAt: null,
			};
			const mockSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([mockUser]),
					}),
				}),
			});
			(db.select as any).mockImplementation(mockSelect);
			(verifyPassword as any).mockResolvedValue(false);

			// Make attempts with different case emails
			await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "Admin@OctaTech.xyz",
					password: "Wrong1!",
				}),
			});

			await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "ADMIN@OCTATECH.XYZ",
					password: "Wrong2!",
				}),
			});

			await app.request("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "admin@octatech.xyz",
					password: "Wrong3!",
				}),
			});

			// All should count toward the same email (case-insensitive)
			expect(getFailedAttemptsCount("admin@octatech.xyz")).toBe(3);
			expect(getFailedAttemptsCount("ADMIN@OCTATECH.XYZ")).toBe(3);
		});
	});
});
