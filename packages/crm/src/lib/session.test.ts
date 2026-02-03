/**
 * Tests for session management utilities.
 *
 * Verifies session token generation, hashing, and database operations
 * per specs/05-authentication.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  createSession,
  validateSession,
  refreshSession,
  shouldRefreshSession,
  deleteSession,
  deleteSessionByToken,
  deleteUserSessions,
  cleanupExpiredSessions,
  getUserSessions,
  updateLastLogin,
  SESSION_CONFIG,
} from "./session";

// Mock the database module
vi.mock("../db", () => {
  return {
    db: {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
    },
    sessions: {},
    adminUser: {},
  };
});

// Import the mocked db after mocking
import { db } from "../db";

describe("SESSION_CONFIG", () => {
  it("should have correct default session duration (24 hours)", () => {
    expect(SESSION_CONFIG.defaultDurationMs).toBe(24 * 60 * 60 * 1000);
  });

  it("should have correct remember me duration (30 days)", () => {
    expect(SESSION_CONFIG.rememberMeDurationMs).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("should have correct token bytes (32 bytes = 256 bits)", () => {
    expect(SESSION_CONFIG.tokenBytes).toBe(32);
  });

  it("should have correct cookie name", () => {
    expect(SESSION_CONFIG.cookieName).toBe("session");
  });

  it("should have correct refresh threshold (1 hour)", () => {
    expect(SESSION_CONFIG.refreshThresholdMs).toBe(60 * 60 * 1000);
  });
});

describe("generateSessionToken", () => {
  it("should return base64url encoded string", () => {
    const token = generateSessionToken();

    // base64url uses A-Z, a-z, 0-9, -, _ (no + or / or =)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("should return 43+ characters (32 bytes base64url encoded)", () => {
    const token = generateSessionToken();

    // 32 bytes = 256 bits, base64url encodes to ceil(32 * 4 / 3) = 43 characters
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("should return unique tokens on each call", () => {
    const tokens = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      tokens.add(generateSessionToken());
    }

    // All tokens should be unique
    expect(tokens.size).toBe(iterations);
  });

  it("should generate cryptographically random tokens", () => {
    // Generate multiple tokens and verify they don't follow predictable patterns
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).not.toBe(token2);
    // Tokens should not share common prefixes (high probability)
    expect(token1.slice(0, 10)).not.toBe(token2.slice(0, 10));
  });
});

describe("hashSessionToken", () => {
  it("should return hex string", () => {
    const hash = hashSessionToken("test-token");

    // SHA-256 hex string is 64 characters
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return 64 characters (SHA-256 hex)", () => {
    const hash = hashSessionToken("any-token");

    expect(hash.length).toBe(64);
  });

  it("should return same hash for same token", () => {
    const token = "consistent-token";
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);

    expect(hash1).toBe(hash2);
  });

  it("should return different hashes for different tokens", () => {
    const hash1 = hashSessionToken("token-1");
    const hash2 = hashSessionToken("token-2");

    expect(hash1).not.toBe(hash2);
  });

  it("should be deterministic across multiple calls", () => {
    const token = generateSessionToken();
    const hashes = Array.from({ length: 5 }, () => hashSessionToken(token));

    // All hashes should be identical
    expect(new Set(hashes).size).toBe(1);
  });

  it("should produce different hash for slightly different tokens", () => {
    const hash1 = hashSessionToken("token");
    const hash2 = hashSessionToken("token ");
    const hash3 = hashSessionToken("Token");

    expect(hash1).not.toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash2).not.toBe(hash3);
  });
});

describe("shouldRefreshSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return true when less than 1 hour remaining", () => {
    // Set current time
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires in 30 minutes
    const expiresAt = new Date("2024-01-01T12:30:00Z");

    expect(shouldRefreshSession(expiresAt)).toBe(true);
  });

  it("should return true when exactly at threshold (59 minutes remaining)", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires in 59 minutes (under 1 hour threshold)
    const expiresAt = new Date("2024-01-01T12:59:00Z");

    expect(shouldRefreshSession(expiresAt)).toBe(true);
  });

  it("should return false when more than 1 hour remaining", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires in 2 hours
    const expiresAt = new Date("2024-01-01T14:00:00Z");

    expect(shouldRefreshSession(expiresAt)).toBe(false);
  });

  it("should return false when session has plenty of time", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires in 24 hours
    const expiresAt = new Date("2024-01-02T12:00:00Z");

    expect(shouldRefreshSession(expiresAt)).toBe(false);
  });

  it("should return true when session is already expired", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session already expired
    const expiresAt = new Date("2024-01-01T11:00:00Z");

    expect(shouldRefreshSession(expiresAt)).toBe(true);
  });

  it("should return true when session expires in exactly 1 hour", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires in exactly 1 hour (at threshold, should NOT refresh yet)
    const expiresAt = new Date("2024-01-01T13:00:00Z");

    // At exactly the threshold, it's not < threshold, so should be false
    expect(shouldRefreshSession(expiresAt)).toBe(false);
  });

  it("should return true when just under threshold", () => {
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Session expires 1 millisecond before the 1 hour mark
    const expiresAt = new Date(
      new Date("2024-01-01T12:00:00Z").getTime() +
        SESSION_CONFIG.refreshThresholdMs -
        1
    );

    expect(shouldRefreshSession(expiresAt)).toBe(true);
  });
});

describe("createSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create session with default duration", async () => {
    const userId = "user-123";
    const mockSession = {
      id: "session-id-456",
      userId,
      tokenHash: "hashed-token",
      expiresAt: new Date(Date.now() + SESSION_CONFIG.defaultDurationMs),
      createdAt: new Date(),
      userAgent: null,
      ipAddress: null,
    };
    const mockUser = { id: userId, email: "test@example.com" };

    // Mock the insert chain
    const mockReturning = vi.fn().mockResolvedValue([mockSession]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValues,
    });

    // Mock the select chain
    const mockLimit = vi.fn().mockResolvedValue([mockUser]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await createSession(userId);

    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThanOrEqual(43);
    expect(result.session.sessionId).toBe("session-id-456");
    expect(result.session.userId).toBe(userId);
    expect(result.session.user.email).toBe("test@example.com");
    expect(db.insert).toHaveBeenCalled();
  });

  it("should create session with remember me duration", async () => {
    const userId = "user-123";
    const mockSession = {
      id: "session-id-456",
      userId,
      tokenHash: "hashed-token",
      expiresAt: new Date(Date.now() + SESSION_CONFIG.rememberMeDurationMs),
      createdAt: new Date(),
      userAgent: null,
      ipAddress: null,
    };
    const mockUser = { id: userId, email: "test@example.com" };

    const mockReturning = vi.fn().mockResolvedValue([mockSession]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValues,
    });

    const mockLimit = vi.fn().mockResolvedValue([mockUser]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await createSession(userId, { rememberMe: true });

    expect(result.token).toBeDefined();
    expect(result.session.sessionId).toBe("session-id-456");
    expect(db.insert).toHaveBeenCalled();
  });

  it("should store user agent and IP address", async () => {
    const userId = "user-123";
    const userAgent = "Mozilla/5.0 Test Browser";
    const ipAddress = "192.168.1.1";

    const mockSession = {
      id: "session-id-456",
      userId,
      tokenHash: "hashed-token",
      expiresAt: new Date(Date.now() + SESSION_CONFIG.defaultDurationMs),
      createdAt: new Date(),
      userAgent,
      ipAddress,
    };
    const mockUser = { id: userId, email: "test@example.com" };

    const mockReturning = vi.fn().mockResolvedValue([mockSession]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValues,
    });

    const mockLimit = vi.fn().mockResolvedValue([mockUser]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    await createSession(userId, { userAgent, ipAddress });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        userAgent,
        ipAddress,
      })
    );
  });
});

describe("validateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return null for empty token", async () => {
    const result = await validateSession("");
    expect(result).toBeNull();
  });

  it("should return null for token shorter than 10 characters", async () => {
    const result = await validateSession("short");
    expect(result).toBeNull();
  });

  it("should return null for non-existent session", async () => {
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await validateSession("valid-token-that-does-not-exist");

    expect(result).toBeNull();
  });

  it("should return session data for valid session", async () => {
    const mockSession = {
      id: "session-123",
      userId: "user-456",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      createdAt: new Date(),
    };
    const mockUser = { id: "user-456", email: "test@example.com" };

    const mockLimit = vi
      .fn()
      .mockResolvedValue([{ session: mockSession, user: mockUser }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await validateSession("valid-session-token");

    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe("session-123");
    expect(result?.userId).toBe("user-456");
    expect(result?.user.email).toBe("test@example.com");
  });

  it("should return null and delete expired session", async () => {
    const mockSession = {
      id: "session-123",
      userId: "user-456",
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago (expired)
      createdAt: new Date(),
    };
    const mockUser = { id: "user-456", email: "test@example.com" };

    const mockLimit = vi
      .fn()
      .mockResolvedValue([{ session: mockSession, user: mockUser }]);
    const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    // Mock delete for cleanup
    const mockDeleteWhere = vi.fn().mockResolvedValue([{ id: "session-123" }]);
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockDeleteWhere,
    });

    const result = await validateSession("expired-session-token");

    expect(result).toBeNull();
    expect(db.delete).toHaveBeenCalled();
  });
});

describe("refreshSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should refresh session with default duration", async () => {
    const newExpiresAt = new Date(Date.now() + SESSION_CONFIG.defaultDurationMs);
    const mockReturning = vi.fn().mockResolvedValue([{ expiresAt: newExpiresAt }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: mockSet,
    });

    const result = await refreshSession("session-123");

    expect(result).toEqual(newExpiresAt);
    expect(db.update).toHaveBeenCalled();
  });

  it("should refresh session with remember me duration", async () => {
    const newExpiresAt = new Date(
      Date.now() + SESSION_CONFIG.rememberMeDurationMs
    );
    const mockReturning = vi.fn().mockResolvedValue([{ expiresAt: newExpiresAt }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: mockSet,
    });

    const result = await refreshSession("session-123", true);

    expect(result).toEqual(newExpiresAt);
  });

  it("should return null for non-existent session", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: mockSet,
    });

    const result = await refreshSession("non-existent-session");

    expect(result).toBeNull();
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when session is deleted", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "session-123" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteSession("session-123");

    expect(result).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it("should return false when session does not exist", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteSession("non-existent-session");

    expect(result).toBe(false);
  });
});

describe("deleteSessionByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete session using hashed token", async () => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "session-123" }]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteSessionByToken("raw-token-value");

    expect(result).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it("should return false for non-existent token", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteSessionByToken("non-existent-token");

    expect(result).toBe(false);
  });
});

describe("deleteUserSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete all sessions for a user", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      { id: "session-1" },
      { id: "session-2" },
      { id: "session-3" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteUserSessions("user-123");

    expect(result).toBe(3);
    expect(db.delete).toHaveBeenCalled();
  });

  it("should return 0 when user has no sessions", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteUserSessions("user-with-no-sessions");

    expect(result).toBe(0);
  });

  it("should delete all except specified session when exceptSessionId is provided", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      { id: "session-1" },
      { id: "session-2" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await deleteUserSessions("user-123", "keep-this-session");

    expect(db.delete).toHaveBeenCalled();
    expect(result).toBe(2);
  });
});

describe("cleanupExpiredSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should delete expired sessions", async () => {
    const mockReturning = vi.fn().mockResolvedValue([
      { id: "expired-1" },
      { id: "expired-2" },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await cleanupExpiredSessions();

    expect(result).toBe(2);
    expect(db.delete).toHaveBeenCalled();
  });

  it("should return 0 when no sessions are expired", async () => {
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: mockWhere,
    });

    const result = await cleanupExpiredSessions();

    expect(result).toBe(0);
  });
});

describe("getUserSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return active sessions for user", async () => {
    const mockSessions = [
      {
        id: "session-1",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        userAgent: "Chrome",
        ipAddress: "192.168.1.1",
      },
      {
        id: "session-2",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200000),
        userAgent: "Firefox",
        ipAddress: "192.168.1.2",
      },
    ];

    const mockWhere = vi.fn().mockResolvedValue(mockSessions);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await getUserSessions("user-123");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("session-1");
    expect(result[0].userAgent).toBe("Chrome");
    expect(result[1].id).toBe("session-2");
    expect(result[1].ipAddress).toBe("192.168.1.2");
  });

  it("should return empty array when user has no active sessions", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: mockFrom,
    });

    const result = await getUserSessions("user-with-no-sessions");

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });
});

describe("updateLastLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should update lastLoginAt for user", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: mockSet,
    });

    await updateLastLogin("user-123");

    expect(db.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lastLoginAt: expect.any(Date),
      })
    );
  });
});

describe("Token and hash integration", () => {
  it("should generate valid tokens that can be hashed", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    // Token should be valid base64url
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    // Hash should be valid hex
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should produce consistent hashes for token lookup", () => {
    const token = generateSessionToken();
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);

    // Same token should always produce same hash (for database lookup)
    expect(hash1).toBe(hash2);
  });

  it("should produce unique hashes for different tokens", () => {
    const tokens = Array.from({ length: 10 }, () => generateSessionToken());
    const hashes = tokens.map(hashSessionToken);
    const uniqueHashes = new Set(hashes);

    expect(uniqueHashes.size).toBe(10);
  });
});
