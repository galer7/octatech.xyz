/**
 * Tests for rate limiting middleware.
 *
 * Verifies rate limiting behavior per API spec in specs/07-api-endpoints.md:
 * - 100 requests/minute for authenticated requests (API key)
 * - 10 requests/minute for unauthenticated requests (by IP)
 * - Proper rate limit headers in responses
 * - 429 response when limit exceeded
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler";
import { clearRateLimitStore, createRateLimiter, RATE_LIMIT_CONFIG } from "./rate-limit";

describe("Rate Limiting Middleware", () => {
	let app: Hono;

	beforeEach(() => {
		// Clear rate limit store between tests
		clearRateLimitStore();

		// Reset timers
		vi.useRealTimers();

		// Create fresh app for each test with error handler
		app = new Hono();
		// Error handler must be registered to convert errors to proper responses
		app.onError(errorHandler);
	});

	describe("RATE_LIMIT_CONFIG", () => {
		it("should have correct authenticated limits per API spec", () => {
			expect(RATE_LIMIT_CONFIG.authenticated.limit).toBe(100);
			expect(RATE_LIMIT_CONFIG.authenticated.windowMs).toBe(60 * 1000);
		});

		it("should have correct unauthenticated limits per API spec", () => {
			expect(RATE_LIMIT_CONFIG.unauthenticated.limit).toBe(10);
			expect(RATE_LIMIT_CONFIG.unauthenticated.windowMs).toBe(60 * 1000);
		});

		it("should have correct login limits", () => {
			expect(RATE_LIMIT_CONFIG.login.limit).toBe(5);
			expect(RATE_LIMIT_CONFIG.login.windowMs).toBe(15 * 60 * 1000);
		});
	});

	describe("Unauthenticated requests", () => {
		beforeEach(() => {
			app.use(
				"*",
				createRateLimiter({
					unauthenticated: { limit: 3, windowMs: 60000 },
					authenticated: { limit: 10, windowMs: 60000 },
				}),
			);
			app.get("/test", (c) => c.json({ ok: true }));
		});

		it("should allow requests under the limit", async () => {
			const res = await app.request("/test");

			expect(res.status).toBe(200);
			expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("2");
			expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
		});

		it("should decrement remaining count with each request", async () => {
			const res1 = await app.request("/test");
			expect(res1.headers.get("X-RateLimit-Remaining")).toBe("2");

			const res2 = await app.request("/test");
			expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");

			const res3 = await app.request("/test");
			expect(res3.headers.get("X-RateLimit-Remaining")).toBe("0");
		});

		it("should return 429 when limit exceeded", async () => {
			// Make 3 requests (the limit)
			await app.request("/test");
			await app.request("/test");
			await app.request("/test");

			// 4th request should be rate limited
			const res = await app.request("/test");

			expect(res.status).toBe(429);
			const body = await res.json();
			expect(body).toEqual({
				error: "Rate limit exceeded",
				code: "RATE_LIMITED",
				retryAfter: expect.any(Number),
			});
			expect(res.headers.get("Retry-After")).toBeTruthy();
		});

		it("should include proper headers on rate limited response", async () => {
			// Exhaust the limit
			for (let i = 0; i < 3; i++) {
				await app.request("/test");
			}

			const res = await app.request("/test");

			expect(res.status).toBe(429);
			expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
		});
	});

	describe("Authenticated requests (API key)", () => {
		beforeEach(() => {
			app.use(
				"*",
				createRateLimiter({
					unauthenticated: { limit: 2, windowMs: 60000 },
					authenticated: { limit: 5, windowMs: 60000 },
				}),
			);
			app.get("/test", (c) => c.json({ ok: true }));
		});

		it("should use higher limit for requests with API key", async () => {
			const res = await app.request("/test", {
				headers: {
					Authorization: "Bearer oct_test_api_key_12345",
				},
			});

			expect(res.status).toBe(200);
			expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
		});

		it("should track authenticated and unauthenticated separately", async () => {
			// Make requests with API key
			const authRes = await app.request("/test", {
				headers: { Authorization: "Bearer oct_test_key_auth" },
			});
			expect(authRes.headers.get("X-RateLimit-Remaining")).toBe("4");

			// Make request without API key (different limit)
			const unauthRes = await app.request("/test");
			expect(unauthRes.headers.get("X-RateLimit-Remaining")).toBe("1");
		});

		it("should track different API keys separately", async () => {
			const res1 = await app.request("/test", {
				headers: { Authorization: "Bearer oct_key_one_xxx" },
			});
			expect(res1.headers.get("X-RateLimit-Remaining")).toBe("4");

			const res2 = await app.request("/test", {
				headers: { Authorization: "Bearer oct_key_two_yyy" },
			});
			expect(res2.headers.get("X-RateLimit-Remaining")).toBe("4");
		});
	});

	describe("Rate limit reset", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		it("should reset count after window expires", async () => {
			const windowMs = 1000;
			app.use(
				"*",
				createRateLimiter({
					unauthenticated: { limit: 2, windowMs },
					authenticated: { limit: 5, windowMs },
				}),
			);
			app.get("/test", (c) => c.json({ ok: true }));

			// Make 2 requests (exhaust limit)
			await app.request("/test");
			await app.request("/test");

			// 3rd request should be rate limited
			const limitedRes = await app.request("/test");
			expect(limitedRes.status).toBe(429);

			// Advance time past the window
			vi.advanceTimersByTime(windowMs + 100);

			// Request should now succeed with fresh limit
			const res = await app.request("/test");
			expect(res.status).toBe(200);
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("1");
		});
	});

	describe("IP detection", () => {
		beforeEach(() => {
			app.use(
				"*",
				createRateLimiter({
					unauthenticated: { limit: 2, windowMs: 60000 },
					authenticated: { limit: 5, windowMs: 60000 },
				}),
			);
			app.get("/test", (c) => c.json({ ok: true }));
		});

		it("should use X-Forwarded-For header when present", async () => {
			const res1 = await app.request("/test", {
				headers: { "X-Forwarded-For": "1.2.3.4" },
			});
			expect(res1.headers.get("X-RateLimit-Remaining")).toBe("1");

			// Different IP should have its own limit
			const res2 = await app.request("/test", {
				headers: { "X-Forwarded-For": "5.6.7.8" },
			});
			expect(res2.headers.get("X-RateLimit-Remaining")).toBe("1");
		});

		it("should use X-Real-IP header when present", async () => {
			const res1 = await app.request("/test", {
				headers: { "X-Real-IP": "10.0.0.1" },
			});
			expect(res1.headers.get("X-RateLimit-Remaining")).toBe("1");
		});

		it("should prefer CF-Connecting-IP (Cloudflare)", async () => {
			const res = await app.request("/test", {
				headers: {
					"CF-Connecting-IP": "192.168.1.1",
					"X-Forwarded-For": "10.0.0.1",
					"X-Real-IP": "172.16.0.1",
				},
			});
			expect(res.status).toBe(200);

			// Make another request with same CF IP
			const res2 = await app.request("/test", {
				headers: {
					"CF-Connecting-IP": "192.168.1.1",
					"X-Forwarded-For": "different-ip",
				},
			});
			// Should be counted against the same identifier
			expect(res2.headers.get("X-RateLimit-Remaining")).toBe("0");
		});
	});
});
