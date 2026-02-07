/**
 * Rate limiting middleware for the CRM API.
 *
 * Implements token bucket algorithm with in-memory storage.
 * Per API spec in specs/07-api-endpoints.md:
 * - Authenticated requests (API key): 100 requests/minute
 * - Unauthenticated requests (by IP): 10 requests/minute
 *
 * Rate limit headers are included in all responses:
 * - X-RateLimit-Limit: Maximum requests per window
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when limit resets
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { RateLimitedError } from "../lib/errors.js";

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  /** Maximum requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/**
 * Rate limit bucket entry
 */
interface RateLimitEntry {
  /** Number of requests made in current window */
  count: number;
  /** Timestamp when the current window started */
  windowStart: number;
}

/**
 * In-memory rate limit store.
 * Maps identifier (API key or IP) to rate limit entry.
 *
 * Note: In production with multiple instances, consider using Redis.
 * For single-instance deployments, in-memory is sufficient.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Default rate limit configurations per API spec
 */
export const RATE_LIMIT_CONFIG = {
  /** Authenticated requests: 100/minute */
  authenticated: {
    limit: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  /** Unauthenticated requests: 10/minute */
  unauthenticated: {
    limit: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  /** Login attempts: 5/15 minutes (more restrictive) */
  login: {
    limit: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
} as const;

/**
 * Clean up expired entries periodically to prevent memory leaks.
 * Runs every 5 minutes.
 */
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanupTimer(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const maxWindowMs = Math.max(
      RATE_LIMIT_CONFIG.authenticated.windowMs,
      RATE_LIMIT_CONFIG.unauthenticated.windowMs,
      RATE_LIMIT_CONFIG.login.windowMs
    );

    for (const [key, entry] of rateLimitStore.entries()) {
      if (now - entry.windowStart > maxWindowMs * 2) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);

  // Don't prevent process exit
  cleanupTimer.unref();
}

// Start cleanup timer
startCleanupTimer();

/**
 * Get the rate limit identifier for a request.
 * Uses API key if authenticated, otherwise falls back to IP.
 */
function getRateLimitIdentifier(c: Context): {
  identifier: string;
  isAuthenticated: boolean;
} {
  // Check for API key in Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    // Use prefix of API key to identify (don't store full key)
    const keyPrefix = apiKey.slice(0, 12);
    return { identifier: `key:${keyPrefix}`, isAuthenticated: true };
  }

  // Fall back to IP address
  // Check common proxy headers first
  const forwardedFor = c.req.header("X-Forwarded-For");
  const realIp = c.req.header("X-Real-IP");
  const cfConnectingIp = c.req.header("CF-Connecting-IP");

  const ip =
    cfConnectingIp ||
    realIp ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    "unknown";

  return { identifier: `ip:${ip}`, isAuthenticated: false };
}

/**
 * Check rate limit for identifier and return current status.
 */
function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  let entry = rateLimitStore.get(identifier);

  // If no entry or window expired, create new window
  if (!entry || now - entry.windowStart >= config.windowMs) {
    entry = {
      count: 0,
      windowStart: now,
    };
    rateLimitStore.set(identifier, entry);
  }

  // Calculate reset timestamp (Unix seconds per spec)
  const resetAt = Math.ceil((entry.windowStart + config.windowMs) / 1000);
  const remaining = Math.max(0, config.limit - entry.count);

  // Check if under limit
  if (entry.count < config.limit) {
    entry.count++;
    return {
      allowed: true,
      remaining: remaining - 1,
      resetAt,
    };
  }

  // Rate limited
  return {
    allowed: false,
    remaining: 0,
    resetAt,
  };
}

/**
 * Set rate limit headers on response.
 */
function setRateLimitHeaders(
  c: Context,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  c.header("X-RateLimit-Limit", limit.toString());
  c.header("X-RateLimit-Remaining", remaining.toString());
  c.header("X-RateLimit-Reset", resetAt.toString());
}

/**
 * Create a rate limiting middleware with custom configuration.
 */
export function createRateLimiter(
  configOverride?: Partial<{
    authenticated: RateLimitConfig;
    unauthenticated: RateLimitConfig;
  }>
): MiddlewareHandler {
  const authenticatedConfig =
    configOverride?.authenticated || RATE_LIMIT_CONFIG.authenticated;
  const unauthenticatedConfig =
    configOverride?.unauthenticated || RATE_LIMIT_CONFIG.unauthenticated;

  return async (c: Context, next: Next) => {
    const { identifier, isAuthenticated } = getRateLimitIdentifier(c);
    const config = isAuthenticated ? authenticatedConfig : unauthenticatedConfig;

    const { allowed, remaining, resetAt } = checkRateLimit(identifier, config);

    // Always set rate limit headers
    setRateLimitHeaders(c, config.limit, remaining, resetAt);

    if (!allowed) {
      const retryAfter = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
      c.header("Retry-After", retryAfter.toString());
      throw new RateLimitedError(retryAfter);
    }

    await next();
  };
}

/**
 * Default rate limiting middleware using spec defaults.
 */
export const rateLimiter = createRateLimiter();

/**
 * Rate limiter specifically for login attempts (more restrictive).
 * Uses separate identifier prefix to track login attempts independently.
 */
export function createLoginRateLimiter(): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Get IP for login rate limiting (always by IP, not by key)
    const forwardedFor = c.req.header("X-Forwarded-For");
    const realIp = c.req.header("X-Real-IP");
    const cfConnectingIp = c.req.header("CF-Connecting-IP");

    const ip =
      cfConnectingIp ||
      realIp ||
      (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
      "unknown";

    const identifier = `login:${ip}`;
    const config = RATE_LIMIT_CONFIG.login;

    const { allowed, remaining, resetAt } = checkRateLimit(identifier, config);

    // Always set rate limit headers
    setRateLimitHeaders(c, config.limit, remaining, resetAt);

    if (!allowed) {
      const retryAfter = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
      c.header("Retry-After", retryAfter.toString());
      throw new RateLimitedError(retryAfter);
    }

    await next();
  };
}

/**
 * Clear rate limit store (for testing).
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Get current rate limit entry for identifier (for testing).
 */
export function getRateLimitEntry(identifier: string): RateLimitEntry | undefined {
  return rateLimitStore.get(identifier);
}
