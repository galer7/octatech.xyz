/**
 * Tests for the main Hono application.
 *
 * Verifies:
 * - Health check endpoint per API spec
 * - 404 handling for unknown routes
 * - Error handling middleware
 * - CORS configuration
 * - Rate limit headers
 */

import { describe, it, expect, beforeEach } from "vitest";
import { app } from "./app";
import { clearRateLimitStore } from "./middleware";

describe("CRM API Application", () => {
  beforeEach(() => {
    // Clear rate limit store between tests
    clearRateLimitStore();
  });

  describe("GET /api/v1/health", () => {
    it("should return healthy status per API spec", async () => {
      const res = await app.request("/api/v1/health");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        status: "healthy",
        version: "1.0.0",
        timestamp: expect.any(String),
      });
    });

    it("should return valid ISO timestamp", async () => {
      const res = await app.request("/api/v1/health");
      const body = await res.json();

      // Verify timestamp is valid ISO 8601
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBe(body.timestamp);
    });

    it("should include rate limit headers", async () => {
      const res = await app.request("/api/v1/health");

      expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });
  });

  describe("GET /", () => {
    it("should redirect to health check", async () => {
      const res = await app.request("/", { redirect: "manual" });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/api/v1/health");
    });
  });

  describe("404 Not Found", () => {
    it("should return 404 for unknown routes", async () => {
      const res = await app.request("/api/v1/nonexistent");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({
        error: "Not Found",
        code: "NOT_FOUND",
      });
    });

    it("should return 404 for routes outside /api/v1", async () => {
      const res = await app.request("/unknown/path");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  describe("CORS", () => {
    it("should include CORS headers for allowed origin", async () => {
      const res = await app.request("/api/v1/health", {
        headers: {
          Origin: "http://localhost:5173",
        },
      });

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:5173"
      );
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    it("should expose rate limit headers", async () => {
      const res = await app.request("/api/v1/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
        },
      });

      const exposeHeaders = res.headers.get("Access-Control-Expose-Headers");
      expect(exposeHeaders).toContain("X-RateLimit-Limit");
      expect(exposeHeaders).toContain("X-RateLimit-Remaining");
      expect(exposeHeaders).toContain("X-RateLimit-Reset");
    });

    it("should allow required methods", async () => {
      const res = await app.request("/api/v1/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
        },
      });

      const allowMethods = res.headers.get("Access-Control-Allow-Methods");
      expect(allowMethods).toContain("GET");
      expect(allowMethods).toContain("POST");
      expect(allowMethods).toContain("PATCH");
      expect(allowMethods).toContain("DELETE");
    });

    it("should allow Authorization header", async () => {
      const res = await app.request("/api/v1/health", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Headers": "Authorization",
        },
      });

      const allowHeaders = res.headers.get("Access-Control-Allow-Headers");
      expect(allowHeaders).toContain("Authorization");
    });
  });

  describe("Security Headers", () => {
    it("should include secure headers", async () => {
      const res = await app.request("/api/v1/health");

      // Check for presence of security headers (exact values depend on secureHeaders defaults)
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  describe("Content-Type", () => {
    it("should return JSON content type", async () => {
      const res = await app.request("/api/v1/health");

      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
  });
});
