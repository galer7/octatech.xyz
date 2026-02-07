/**
 * Authentication middleware for the CRM admin routes.
 *
 * Implements session validation and user context injection per specs/05-authentication.md.
 * Protects admin routes by requiring valid session cookies.
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  validateSession,
  refreshSession,
  shouldRefreshSession,
  SESSION_CONFIG,
  type SessionData,
} from "../lib/session.js";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * Extended context with authenticated user data.
 */
export interface AuthContext {
  session: SessionData;
}

/**
 * Type helper to extend Hono context with auth data.
 */
declare module "hono" {
  interface ContextVariableMap {
    session: SessionData;
  }
}

/**
 * Cookie options for session cookies per security spec.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Lax" as const,
  path: "/",
};

/**
 * Get the session cookie options with expiration.
 */
function getSessionCookieOptions(expiresAt: Date) {
  return {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
  };
}

/**
 * Authentication middleware that validates session cookies.
 *
 * - Checks for valid session cookie
 * - Validates session against database
 * - Refreshes session if close to expiring (sliding expiration)
 * - Injects session data into context for route handlers
 *
 * @throws UnauthorizedError if no valid session
 */
export const requireAuth: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  // Get session token from cookie
  const token = getCookie(c, SESSION_CONFIG.cookieName);

  if (!token) {
    throw new UnauthorizedError("Not authenticated");
  }

  // Validate session
  const session = await validateSession(token);

  if (!session) {
    // Clear invalid cookie
    deleteCookie(c, SESSION_CONFIG.cookieName, COOKIE_OPTIONS);
    throw new UnauthorizedError("Session expired or invalid");
  }

  // Check if session should be refreshed (sliding expiration)
  if (shouldRefreshSession(session.expiresAt)) {
    // Determine if this is a "remember me" session based on original duration
    const isRememberMe =
      session.expiresAt.getTime() - session.createdAt.getTime() >
      SESSION_CONFIG.defaultDurationMs * 1.5;

    const newExpiresAt = await refreshSession(session.sessionId, isRememberMe);
    if (newExpiresAt) {
      session.expiresAt = newExpiresAt;
      // Update cookie with new expiration
      setCookie(
        c,
        SESSION_CONFIG.cookieName,
        token,
        getSessionCookieOptions(newExpiresAt)
      );
    }
  }

  // Inject session data into context
  c.set("session", session);

  await next();
};

/**
 * Optional authentication middleware.
 * Does not throw if not authenticated, but injects session if present.
 * Useful for routes that behave differently based on auth state.
 */
export const optionalAuth: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const token = getCookie(c, SESSION_CONFIG.cookieName);

  if (token) {
    const session = await validateSession(token);
    if (session) {
      c.set("session", session);

      // Refresh if needed
      if (shouldRefreshSession(session.expiresAt)) {
        const isRememberMe =
          session.expiresAt.getTime() - session.createdAt.getTime() >
          SESSION_CONFIG.defaultDurationMs * 1.5;

        const newExpiresAt = await refreshSession(
          session.sessionId,
          isRememberMe
        );
        if (newExpiresAt) {
          setCookie(
            c,
            SESSION_CONFIG.cookieName,
            token,
            getSessionCookieOptions(newExpiresAt)
          );
        }
      }
    }
  }

  await next();
};

/**
 * Set the session cookie after successful login.
 *
 * @param c - Hono context
 * @param token - The session token
 * @param expiresAt - When the session expires
 */
export function setSessionCookie(
  c: Context,
  token: string,
  expiresAt: Date
): void {
  setCookie(
    c,
    SESSION_CONFIG.cookieName,
    token,
    getSessionCookieOptions(expiresAt)
  );
}

/**
 * Clear the session cookie (logout).
 *
 * @param c - Hono context
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_CONFIG.cookieName, COOKIE_OPTIONS);
}

/**
 * Get the current session from context.
 * Returns undefined if not authenticated.
 *
 * @param c - Hono context
 * @returns Session data or undefined
 */
export function getSession(c: Context): SessionData | undefined {
  return c.get("session");
}

/**
 * Get the current session from context, throwing if not authenticated.
 * Use this in routes that require authentication.
 *
 * @param c - Hono context
 * @returns Session data
 * @throws UnauthorizedError if not authenticated
 */
export function requireSession(c: Context): SessionData {
  const session = c.get("session");
  if (!session) {
    throw new UnauthorizedError("Not authenticated");
  }
  return session;
}

/**
 * Middleware to require CSRF token validation.
 * Per spec: require X-Requested-With header for extra CSRF protection.
 *
 * This is in addition to SameSite=Lax cookies.
 * Only applied to state-changing requests (POST, PATCH, DELETE).
 */
export const requireCsrfHeader: MiddlewareHandler = async (
  c: Context,
  next: Next
) => {
  const method = c.req.method;

  // Only check state-changing methods
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const xRequestedWith = c.req.header("X-Requested-With");

    if (xRequestedWith !== "XMLHttpRequest") {
      throw new UnauthorizedError("Invalid request");
    }
  }

  await next();
};
