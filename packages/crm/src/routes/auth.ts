/**
 * Authentication routes for the CRM admin interface.
 *
 * Implements login, logout, current user, and password change endpoints
 * per specs/05-authentication.md.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { adminUser } from "../db/schema";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "../lib/password";
import {
  createSession,
  deleteSessionByToken,
  deleteUserSessions,
  updateLastLogin,
  SESSION_CONFIG,
} from "../lib/session";
import {
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  requireSession,
  requireCsrfHeader,
} from "../middleware/auth";
import { createLoginRateLimiter } from "../middleware/rate-limit";
import {
  ValidationError,
  UnauthorizedError,
  BadRequestError,
} from "../lib/errors";
import { getCookie } from "hono/cookie";

/**
 * Auth routes app instance.
 */
export const authRoutes = new Hono();

/**
 * Login request schema.
 */
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Change password request schema.
 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(1, "New password is required"),
});

/**
 * In-memory store for failed login attempts (for account lockout).
 * In production with multiple instances, use Redis.
 */
const failedAttempts = new Map<
  string,
  { count: number; lockedUntil: Date | null }
>();

/**
 * Account lockout configuration.
 */
const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
} as const;

/**
 * Check if an account is locked out.
 */
function isAccountLocked(email: string): { locked: boolean; remainingMs: number } {
  const attempts = failedAttempts.get(email.toLowerCase());
  if (!attempts?.lockedUntil) {
    return { locked: false, remainingMs: 0 };
  }

  const now = new Date();
  if (attempts.lockedUntil > now) {
    return {
      locked: true,
      remainingMs: attempts.lockedUntil.getTime() - now.getTime(),
    };
  }

  // Lockout expired, reset
  failedAttempts.delete(email.toLowerCase());
  return { locked: false, remainingMs: 0 };
}

/**
 * Record a failed login attempt.
 */
function recordFailedAttempt(email: string): void {
  const key = email.toLowerCase();
  const attempts = failedAttempts.get(key) || { count: 0, lockedUntil: null };
  attempts.count++;

  if (attempts.count >= LOCKOUT_CONFIG.maxAttempts) {
    attempts.lockedUntil = new Date(Date.now() + LOCKOUT_CONFIG.lockoutDurationMs);
  }

  failedAttempts.set(key, attempts);
}

/**
 * Clear failed attempts after successful login.
 */
function clearFailedAttempts(email: string): void {
  failedAttempts.delete(email.toLowerCase());
}

/**
 * Get client IP address for logging.
 */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Real-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown"
  );
}

/**
 * POST /api/auth/login
 *
 * Authenticate with email and password.
 * Sets httpOnly session cookie on success.
 */
authRoutes.post("/login", createLoginRateLimiter(), async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = loginSchema.safeParse(body);

  if (!parseResult.success) {
    const errors: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path[0]?.toString() || "unknown";
      errors[field] = issue.message;
    }
    throw new ValidationError("Invalid login request", errors);
  }

  const { email, password, rememberMe } = parseResult.data;

  // Check account lockout
  const lockout = isAccountLocked(email);
  if (lockout.locked) {
    const minutes = Math.ceil(lockout.remainingMs / 60000);
    return c.json(
      {
        success: false,
        error: `Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
      },
      423
    );
  }

  // Find user by email
  const [user] = await db
    .select()
    .from(adminUser)
    .where(eq(adminUser.email, email.toLowerCase()))
    .limit(1);

  // Verify password (timing-safe: always verify even if user not found)
  const dummyHash =
    "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const isValid = await verifyPassword(
    user?.passwordHash || dummyHash,
    password
  );

  if (!user || !isValid) {
    recordFailedAttempt(email);

    // Generic error message that doesn't reveal if email exists
    return c.json(
      {
        success: false,
        error: "Invalid email or password",
      },
      401
    );
  }

  // Clear failed attempts on success
  clearFailedAttempts(email);

  // Create session
  const { token, session } = await createSession(user.id, {
    rememberMe,
    userAgent: c.req.header("User-Agent"),
    ipAddress: getClientIp(c),
  });

  // Update last login timestamp
  await updateLastLogin(user.id);

  // Set session cookie
  setSessionCookie(c, token, session.expiresAt);

  return c.json({
    success: true,
    user: {
      id: session.user.id,
      email: session.user.email,
    },
  });
});

/**
 * POST /api/auth/logout
 *
 * End the current session and clear the cookie.
 */
authRoutes.post("/logout", async (c) => {
  // Get token from cookie
  const token = getCookie(c, SESSION_CONFIG.cookieName);

  if (token) {
    // Delete session from database
    await deleteSessionByToken(token);
  }

  // Clear cookie
  clearSessionCookie(c);

  return c.json({
    success: true,
  });
});

/**
 * GET /api/auth/me
 *
 * Get the currently authenticated user.
 * Returns 401 if not authenticated.
 */
authRoutes.get("/me", requireAuth, async (c) => {
  const session = requireSession(c);

  return c.json({
    user: {
      id: session.user.id,
      email: session.user.email,
    },
  });
});

/**
 * POST /api/auth/change-password
 *
 * Change the current user's password.
 * Requires current password for verification.
 * Optionally invalidates all other sessions.
 */
authRoutes.post(
  "/change-password",
  requireAuth,
  requireCsrfHeader,
  async (c) => {
    const session = requireSession(c);

    // Parse and validate request body
    const body = await c.req.json().catch(() => ({}));
    const parseResult = changePasswordSchema.safeParse(body);

    if (!parseResult.success) {
      const errors: Record<string, string> = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path[0]?.toString() || "unknown";
        errors[field] = issue.message;
      }
      throw new ValidationError("Invalid request", errors);
    }

    const { currentPassword, newPassword } = parseResult.data;

    // Validate new password strength
    const strengthResult = validatePasswordStrength(newPassword);
    if (!strengthResult.valid) {
      throw new ValidationError("Password does not meet requirements", {
        newPassword: strengthResult.errors[0] || "Invalid password",
      });
    }

    // Get current user with password hash
    const [user] = await db
      .select()
      .from(adminUser)
      .where(eq(adminUser.id, session.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError("User not found");
    }

    // Verify current password
    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      throw new BadRequestError("Current password is incorrect");
    }

    // Check new password is different
    const isSame = await verifyPassword(user.passwordHash, newPassword);
    if (isSame) {
      throw new BadRequestError(
        "New password must be different from current password"
      );
    }

    // Hash and save new password
    const newPasswordHash = await hashPassword(newPassword);
    await db
      .update(adminUser)
      .set({ passwordHash: newPasswordHash })
      .where(eq(adminUser.id, user.id));

    // Invalidate all other sessions (security best practice)
    await deleteUserSessions(user.id, session.sessionId);

    return c.json({
      success: true,
      message: "Password updated successfully",
    });
  }
);

/**
 * Clear failed attempts store (for testing).
 */
export function clearFailedAttemptsStore(): void {
  failedAttempts.clear();
}

/**
 * Get failed attempts count (for testing).
 */
export function getFailedAttemptsCount(email: string): number {
  return failedAttempts.get(email.toLowerCase())?.count || 0;
}
