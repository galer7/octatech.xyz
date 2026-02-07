/**
 * API Key authentication middleware for the CRM API.
 *
 * Implements Bearer token extraction, key validation, and scope checking
 * per specs/06-api-keys.md.
 *
 * This middleware is used for public API endpoints that require API key authentication,
 * as opposed to session-based auth used for the admin UI.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import {
  validateApiKey,
  hasScope,
  type ValidatedApiKey,
} from "../lib/api-keys.js";
import { InvalidApiKeyError, InsufficientScopeError } from "../lib/errors.js";

/**
 * Extended context with API key data.
 */
export interface ApiKeyContext {
  apiKey: ValidatedApiKey;
}

/**
 * Type helper to extend Hono context with API key data.
 */
declare module "hono" {
  interface ContextVariableMap {
    apiKey: ValidatedApiKey;
  }
}

/**
 * Extract Bearer token from Authorization header.
 *
 * @param c - Hono context
 * @returns The token without "Bearer " prefix, or null if not present
 *
 * @example
 * ```ts
 * // Authorization: Bearer oct_abc123...
 * const token = extractBearerToken(c);
 * // token === "oct_abc123..."
 * ```
 */
export function extractBearerToken(c: Context): string | null {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return null;
  }

  // Check for Bearer prefix (case-insensitive)
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  // Extract token after "Bearer "
  const token = authHeader.substring(7).trim();

  return token || null;
}

/**
 * Middleware that requires a valid API key.
 *
 * This middleware:
 * 1. Extracts the Bearer token from Authorization header
 * 2. Validates the API key against the database
 * 3. Injects the API key data into context for route handlers
 *
 * @throws InvalidApiKeyError if the key is missing, invalid, or revoked
 *
 * @example
 * ```ts
 * app.use("/api/v1/*", requireApiKey);
 * ```
 */
export const requireApiKey: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const token = extractBearerToken(c);

  if (!token) {
    throw new InvalidApiKeyError("Missing API key");
  }

  const apiKey = await validateApiKey(token);

  if (!apiKey) {
    throw new InvalidApiKeyError("Invalid or revoked API key");
  }

  // Inject API key data into context
  c.set("apiKey", apiKey);

  await next();
};

/**
 * Create middleware that requires a specific scope.
 *
 * Use this after requireApiKey to enforce scope requirements.
 *
 * @param requiredScope - The scope required for the endpoint
 * @returns Middleware that checks the scope
 *
 * @throws InsufficientScopeError if the key doesn't have the required scope
 *
 * @example
 * ```ts
 * // Require leads:write scope
 * app.post("/api/v1/leads", requireApiKey, requireScope("leads:write"), createLead);
 * ```
 */
export function requireScope(requiredScope: string): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const apiKey = c.get("apiKey");

    if (!apiKey) {
      // This should not happen if requireApiKey ran first
      throw new InvalidApiKeyError("API key not authenticated");
    }

    if (!hasScope(apiKey.scopes, requiredScope)) {
      throw new InsufficientScopeError(requiredScope);
    }

    await next();
  };
}

/**
 * Middleware that optionally validates an API key.
 *
 * Does not throw if no key is present, but validates if one is.
 * Useful for endpoints that behave differently based on auth status.
 *
 * @example
 * ```ts
 * app.get("/api/v1/public-info", optionalApiKey, getInfo);
 *
 * // In the handler:
 * const apiKey = getApiKeyFromContext(c);
 * if (apiKey) {
 *   // Return full info
 * } else {
 *   // Return limited info
 * }
 * ```
 */
export const optionalApiKey: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const token = extractBearerToken(c);

  if (token) {
    const apiKey = await validateApiKey(token);

    if (apiKey) {
      c.set("apiKey", apiKey);
    }
    // If token is present but invalid, we still proceed (optional auth)
  }

  await next();
};

/**
 * Get the current API key from context.
 * Returns undefined if not authenticated.
 *
 * @param c - Hono context
 * @returns API key data or undefined
 *
 * @example
 * ```ts
 * const apiKey = getApiKeyFromContext(c);
 * if (apiKey) {
 *   console.log(`Request from: ${apiKey.name}`);
 * }
 * ```
 */
export function getApiKeyFromContext(c: Context): ValidatedApiKey | undefined {
  return c.get("apiKey");
}

/**
 * Get the current API key from context, throwing if not authenticated.
 * Use this in routes that require API key authentication.
 *
 * @param c - Hono context
 * @returns API key data
 * @throws InvalidApiKeyError if not authenticated
 *
 * @example
 * ```ts
 * app.get("/api/v1/leads", requireApiKey, async (c) => {
 *   const apiKey = requireApiKeyFromContext(c);
 *   console.log(`Request from: ${apiKey.name}`);
 *   // ...
 * });
 * ```
 */
export function requireApiKeyFromContext(c: Context): ValidatedApiKey {
  const apiKey = c.get("apiKey");

  if (!apiKey) {
    throw new InvalidApiKeyError("API key not authenticated");
  }

  return apiKey;
}

/**
 * Check if the current request has a specific scope.
 * Requires that requireApiKey middleware has run first.
 *
 * @param c - Hono context
 * @param scope - The scope to check
 * @returns true if the API key has the scope
 *
 * @example
 * ```ts
 * if (hasCurrentScope(c, "leads:delete")) {
 *   // Allow delete operation
 * } else {
 *   // Return limited response
 * }
 * ```
 */
export function hasCurrentScope(c: Context, scope: string): boolean {
  const apiKey = getApiKeyFromContext(c);

  if (!apiKey) {
    return false;
  }

  return hasScope(apiKey.scopes, scope);
}

/**
 * Get the identifier for rate limiting.
 *
 * For API key requests, uses the key prefix for identification.
 * This allows rate limiting per API key rather than per IP.
 *
 * @param c - Hono context
 * @returns The rate limit identifier (API key prefix or IP address)
 *
 * @example
 * ```ts
 * const identifier = getRateLimitIdentifier(c);
 * // "apikey:oct_abc1..." or "ip:192.168.1.1"
 * ```
 */
export function getRateLimitIdentifier(c: Context): string {
  const apiKey = getApiKeyFromContext(c);

  if (apiKey) {
    return `apikey:${apiKey.keyPrefix}`;
  }

  // Fall back to IP address
  const ip =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Real-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";

  return `ip:${ip}`;
}
