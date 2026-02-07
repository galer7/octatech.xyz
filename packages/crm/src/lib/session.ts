/**
 * Session management utilities for the CRM authentication system.
 *
 * Implements secure session token generation and management per specs/05-authentication.md.
 * Sessions are stored in the database with hashed tokens for security.
 */

import { randomBytes, createHash } from "crypto";
import { eq, lt, gt, and, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessions, adminUser } from "../db/schema.js";

/**
 * Session configuration
 */
export const SESSION_CONFIG = {
  /** Default session duration: 24 hours */
  defaultDurationMs: 24 * 60 * 60 * 1000,
  /** Extended session duration (remember me): 30 days */
  rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
  /** Token length in bytes (32 bytes = 256 bits) */
  tokenBytes: 32,
  /** Cookie name */
  cookieName: "session",
  /** Session refresh threshold: refresh if less than 1 hour remaining */
  refreshThresholdMs: 60 * 60 * 1000,
} as const;

/**
 * Session data returned to the application.
 * Contains user information and session metadata.
 */
export interface SessionData {
  sessionId: string;
  userId: string;
  user: {
    id: string;
    email: string;
  };
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Generate a cryptographically secure session token.
 * Returns the token as a base64url encoded string.
 *
 * @returns A secure random token
 */
export function generateSessionToken(): string {
  const bytes = randomBytes(SESSION_CONFIG.tokenBytes);
  // Use base64url encoding (URL-safe, no padding)
  return bytes.toString("base64url");
}

/**
 * Hash a session token for secure storage.
 * Uses SHA-256 to create a one-way hash of the token.
 *
 * @param token - The raw session token
 * @returns The hashed token as a hex string
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session for a user.
 *
 * @param userId - The user ID to create session for
 * @param options - Session creation options
 * @returns The raw session token (to be stored in cookie) and session data
 */
export async function createSession(
  userId: string,
  options: {
    rememberMe?: boolean;
    userAgent?: string;
    ipAddress?: string;
  } = {}
): Promise<{ token: string; session: SessionData }> {
  const { rememberMe = false, userAgent, ipAddress } = options;

  // Generate token
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  // Calculate expiration
  const durationMs = rememberMe
    ? SESSION_CONFIG.rememberMeDurationMs
    : SESSION_CONFIG.defaultDurationMs;
  const expiresAt = new Date(Date.now() + durationMs);

  // Create session in database
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    })
    .returning();

  // Get user data
  const [user] = await db
    .select({
      id: adminUser.id,
      email: adminUser.email,
    })
    .from(adminUser)
    .where(eq(adminUser.id, userId))
    .limit(1);

  return {
    token,
    session: {
      sessionId: session.id,
      userId: session.userId,
      user: {
        id: user.id,
        email: user.email,
      },
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    },
  };
}

/**
 * Validate a session token and return session data if valid.
 *
 * @param token - The raw session token from the cookie
 * @returns Session data if valid, null if invalid or expired
 */
export async function validateSession(
  token: string
): Promise<SessionData | null> {
  if (!token || token.length < 10) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const now = new Date();

  // Find session and join with user
  const result = await db
    .select({
      session: sessions,
      user: {
        id: adminUser.id,
        email: adminUser.email,
      },
    })
    .from(sessions)
    .innerJoin(adminUser, eq(sessions.userId, adminUser.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const { session, user } = result[0];

  // Check if expired
  if (session.expiresAt < now) {
    // Clean up expired session
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    user,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  };
}

/**
 * Refresh a session's expiration if it's close to expiring.
 * This implements sliding session expiration.
 *
 * @param sessionId - The session ID to refresh
 * @param rememberMe - Whether this was a "remember me" session
 * @returns The new expiration date, or null if session not found
 */
export async function refreshSession(
  sessionId: string,
  rememberMe = false
): Promise<Date | null> {
  const durationMs = rememberMe
    ? SESSION_CONFIG.rememberMeDurationMs
    : SESSION_CONFIG.defaultDurationMs;
  const newExpiresAt = new Date(Date.now() + durationMs);

  const [updated] = await db
    .update(sessions)
    .set({ expiresAt: newExpiresAt })
    .where(eq(sessions.id, sessionId))
    .returning({ expiresAt: sessions.expiresAt });

  return updated?.expiresAt ?? null;
}

/**
 * Check if a session should be refreshed (close to expiring).
 *
 * @param expiresAt - The session's current expiration date
 * @returns True if the session should be refreshed
 */
export function shouldRefreshSession(expiresAt: Date): boolean {
  const timeUntilExpiry = expiresAt.getTime() - Date.now();
  return timeUntilExpiry < SESSION_CONFIG.refreshThresholdMs;
}

/**
 * Delete a session (logout).
 *
 * @param sessionId - The session ID to delete
 * @returns True if a session was deleted, false otherwise
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const result = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });

  return result.length > 0;
}

/**
 * Delete a session by token.
 *
 * @param token - The raw session token
 * @returns True if a session was deleted, false otherwise
 */
export async function deleteSessionByToken(token: string): Promise<boolean> {
  const tokenHash = hashSessionToken(token);

  const result = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id });

  return result.length > 0;
}

/**
 * Delete all sessions for a user (useful for password change).
 *
 * @param userId - The user ID whose sessions to delete
 * @param exceptSessionId - Optional session ID to keep (current session)
 * @returns Number of sessions deleted
 */
export async function deleteUserSessions(
  userId: string,
  exceptSessionId?: string
): Promise<number> {
  if (exceptSessionId) {
    // Delete all sessions for user except the specified one
    const result = await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)))
      .returning({ id: sessions.id });
    return result.length;
  }

  const result = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });

  return result.length;
}

/**
 * Clean up expired sessions from the database.
 * Should be run periodically (e.g., via cron job).
 *
 * @returns Number of sessions cleaned up
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = new Date();

  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });

  return result.length;
}

/**
 * Get all active sessions for a user.
 *
 * @param userId - The user ID
 * @returns Array of session metadata (not including sensitive token data)
 */
export async function getUserSessions(
  userId: string
): Promise<
  Array<{
    id: string;
    createdAt: Date;
    expiresAt: Date;
    userAgent: string | null;
    ipAddress: string | null;
  }>
> {
  const now = new Date();

  const result = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)));

  return result;
}

/**
 * Update the last login timestamp for a user.
 *
 * @param userId - The user ID
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await db
    .update(adminUser)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUser.id, userId));
}
