/**
 * Hono application setup for the CRM API.
 *
 * Configures middleware (CORS, logging, security headers, rate limiting)
 * and registers routes. Error handling follows the API spec in
 * specs/07-api-endpoints.md.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import { errorHandler, notFoundHandler, rateLimiter } from "./middleware";
import { authRoutes } from "./routes/auth";
import { adminApiKeysRoutes, adminWebhooksRoutes, adminNotificationsRoutes, adminSettingsRoutes } from "./routes/admin";
import { leadsRoutes, publicLeadsRoutes, meRoutes, calWebhookRoutes } from "./routes/api";

export const app = new Hono();

// Request logging
app.use("*", logger());

// Security headers (XSS protection, content type options, etc.)
app.use("*", secureHeaders());

// CORS configuration
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
  })
);

// Rate limiting (100/min authenticated, 10/min unauthenticated)
// Applied to all routes except health check
app.use("/api/v1/*", rateLimiter);

// Health check endpoint (no auth, no rate limiting)
app.get("/api/v1/health", (c) => {
  return c.json({
    status: "healthy",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Auth routes (login, logout, me, change-password)
app.route("/api/auth", authRoutes);

// Admin API key management routes
app.route("/api/admin/api-keys", adminApiKeysRoutes);

// Admin webhook management routes
app.route("/api/admin/webhooks", adminWebhooksRoutes);

// Admin notification channel management routes
app.route("/api/admin/notifications", adminNotificationsRoutes);

// Admin settings management routes
app.route("/api/admin/settings", adminSettingsRoutes);

// Public leads endpoint (contact form) - no auth required
// Rate limiting is applied via the /api/* pattern
app.use("/api/leads", rateLimiter);
app.route("/api/leads", publicLeadsRoutes);

// Cal.com webhook endpoint - no auth required
// Cal.com sends webhooks when bookings are created
app.use("/api/webhooks/cal", rateLimiter);
app.route("/api/webhooks/cal", calWebhookRoutes);

// API v1 routes (require API key authentication)
app.route("/api/v1/leads", leadsRoutes);
app.route("/api/v1/me", meRoutes);

// Root redirect to admin UI
app.get("/", (c) => {
  return c.redirect("/admin");
});

// Admin UI static files
// Serve static assets from the admin build directory
app.use(
  "/admin/*",
  serveStatic({
    root: "./dist/admin",
    rewriteRequestPath: (path) => path.replace(/^\/admin/, ""),
  })
);

// SPA fallback for admin routes - serve index.html for client-side routing
app.get("/admin/*", async (c) => {
  // For SPA routing, we need to serve index.html for non-asset routes
  const path = c.req.path;

  // If the path has a file extension, let it 404 (it's a missing asset)
  if (path.includes(".")) {
    return c.notFound();
  }

  // Otherwise, serve index.html for client-side routing
  try {
    const fs = await import("node:fs/promises");
    const nodePath = await import("node:path");
    const indexPath = nodePath.join(process.cwd(), "dist", "admin", "index.html");
    const html = await fs.readFile(indexPath, "utf-8");
    return c.html(html);
  } catch {
    return c.notFound();
  }
});

// 404 handler for unmatched routes
app.notFound(notFoundHandler);

// Global error handler
app.onError(errorHandler);
