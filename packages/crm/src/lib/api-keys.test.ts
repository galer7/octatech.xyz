/**
 * Tests for API key utilities.
 *
 * Verifies key generation, hashing, validation, and scope checking
 * per specs/06-api-keys.md.
 */

import { describe, expect, it, vi } from "vitest";

// Mock the database module BEFORE importing api-keys
vi.mock("../db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve([])),
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => Promise.resolve([])),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([])),
				})),
			})),
		})),
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(() => Promise.resolve([])),
			})),
		})),
	},
}));

import {
	API_KEY_CONFIG,
	areValidScopes,
	constantTimeCompare,
	generateApiKey,
	hashApiKey,
	hasScope,
	isValidKeyFormat,
	VALID_SCOPES,
} from "./api-keys";

describe("generateApiKey", () => {
	it("should generate a key with correct format", () => {
		const { key } = generateApiKey();

		expect(key).toMatch(/^oct_[a-zA-Z0-9]{32}$/);
		expect(key.length).toBe(API_KEY_CONFIG.totalLength);
		expect(key.startsWith(API_KEY_CONFIG.prefix)).toBe(true);
	});

	it("should generate a unique hash for each key", () => {
		const { hash: hash1 } = generateApiKey();
		const { hash: hash2 } = generateApiKey();

		expect(hash1).not.toBe(hash2);
	});

	it("should generate a prefix for display", () => {
		const { key, prefix } = generateApiKey();

		expect(prefix).toBe(`${key.substring(0, 12)}...`);
		expect(prefix.length).toBe(15); // 12 chars + "..."
	});

	it("should generate unique keys (no duplicates in 1000 keys)", () => {
		const keys = new Set<string>();

		for (let i = 0; i < 1000; i++) {
			const { key } = generateApiKey();
			keys.add(key);
		}

		expect(keys.size).toBe(1000);
	});

	it("should generate keys with only base62 characters in random part", () => {
		const base62Regex = /^[a-zA-Z0-9]+$/;

		for (let i = 0; i < 100; i++) {
			const { key } = generateApiKey();
			const randomPart = key.substring(API_KEY_CONFIG.prefix.length);
			expect(randomPart).toMatch(base62Regex);
		}
	});

	it("should generate keys with cryptographic randomness", () => {
		// Generate multiple keys and check distribution
		const charCounts: Record<string, number> = {};

		for (let i = 0; i < 1000; i++) {
			const { key } = generateApiKey();
			const randomPart = key.substring(API_KEY_CONFIG.prefix.length);
			for (const char of randomPart) {
				charCounts[char] = (charCounts[char] || 0) + 1;
			}
		}

		// All 62 characters should appear at least once
		expect(Object.keys(charCounts).length).toBeGreaterThan(50);
	});
});

describe("hashApiKey", () => {
	it("should produce a 64-character hex string (SHA-256)", () => {
		const key = "oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
		const hash = hashApiKey(key);

		expect(hash.length).toBe(64);
		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("should produce consistent hashes for the same key", () => {
		const key = "oct_testkey12345678901234567890ab";
		const hash1 = hashApiKey(key);
		const hash2 = hashApiKey(key);

		expect(hash1).toBe(hash2);
	});

	it("should produce different hashes for different keys", () => {
		const hash1 = hashApiKey("oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6");
		const hash2 = hashApiKey("oct_z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4");

		expect(hash1).not.toBe(hash2);
	});

	it("should be case-sensitive", () => {
		const hash1 = hashApiKey("oct_ABCDabcd12345678901234567890ab");
		const hash2 = hashApiKey("oct_abcdABCD12345678901234567890ab");

		expect(hash1).not.toBe(hash2);
	});

	it("should hash empty string without error", () => {
		const hash = hashApiKey("");
		expect(hash.length).toBe(64);
	});
});

describe("isValidKeyFormat", () => {
	it("should return true for valid key format", () => {
		const { key } = generateApiKey();
		expect(isValidKeyFormat(key)).toBe(true);
	});

	it("should return true for manually constructed valid key", () => {
		const key = "oct_abcdefghij1234567890ABCDEFGHIJ12";
		expect(isValidKeyFormat(key)).toBe(true);
	});

	it("should return false for key without prefix", () => {
		expect(isValidKeyFormat("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")).toBe(false);
	});

	it("should return false for key with wrong prefix", () => {
		expect(isValidKeyFormat("key_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")).toBe(false);
		expect(isValidKeyFormat("sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")).toBe(false);
	});

	it("should return false for key that is too short", () => {
		expect(isValidKeyFormat("oct_short")).toBe(false);
		expect(isValidKeyFormat("oct_abc123")).toBe(false);
	});

	it("should return false for key that is too long", () => {
		expect(isValidKeyFormat("oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6extra")).toBe(false);
	});

	it("should return false for key with invalid characters", () => {
		expect(isValidKeyFormat("oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4!@#$")).toBe(false);
		expect(isValidKeyFormat("oct_a1b2c3d4e5f6g7h8-9j0k1l2m3n4o5p6")).toBe(false);
		expect(isValidKeyFormat("oct_a1b2c3d4e5f6g7h8_9j0k1l2m3n4o5p6")).toBe(false);
	});

	it("should return false for empty string", () => {
		expect(isValidKeyFormat("")).toBe(false);
	});

	it("should return false for just the prefix", () => {
		expect(isValidKeyFormat("oct_")).toBe(false);
	});

	it("should return false for key with spaces", () => {
		expect(isValidKeyFormat("oct_ a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p")).toBe(false);
	});
});

describe("hasScope", () => {
	describe("exact match", () => {
		it("should return true for exact scope match", () => {
			expect(hasScope(["leads:read"], "leads:read")).toBe(true);
			expect(hasScope(["leads:write"], "leads:write")).toBe(true);
			expect(hasScope(["leads:delete"], "leads:delete")).toBe(true);
		});

		it("should return false when scope is not present", () => {
			expect(hasScope(["leads:read"], "leads:write")).toBe(false);
			expect(hasScope(["leads:write"], "leads:delete")).toBe(false);
		});

		it("should check all scopes in array", () => {
			const scopes = ["leads:read", "leads:write"];
			expect(hasScope(scopes, "leads:read")).toBe(true);
			expect(hasScope(scopes, "leads:write")).toBe(true);
			expect(hasScope(scopes, "leads:delete")).toBe(false);
		});
	});

	describe("resource wildcard", () => {
		it("should match any action with resource wildcard", () => {
			const scopes = ["leads:*"];
			expect(hasScope(scopes, "leads:read")).toBe(true);
			expect(hasScope(scopes, "leads:write")).toBe(true);
			expect(hasScope(scopes, "leads:delete")).toBe(true);
			expect(hasScope(scopes, "leads:anything")).toBe(true);
		});

		it("should not match other resources with resource wildcard", () => {
			const scopes = ["leads:*"];
			expect(hasScope(scopes, "users:read")).toBe(false);
			expect(hasScope(scopes, "webhooks:write")).toBe(false);
		});
	});

	describe("global wildcard", () => {
		it("should match everything with global wildcard", () => {
			const scopes = ["*"];
			expect(hasScope(scopes, "leads:read")).toBe(true);
			expect(hasScope(scopes, "leads:write")).toBe(true);
			expect(hasScope(scopes, "users:read")).toBe(true);
			expect(hasScope(scopes, "anything:anything")).toBe(true);
		});
	});

	describe("empty scopes", () => {
		it("should return false for empty scopes array", () => {
			expect(hasScope([], "leads:read")).toBe(false);
			expect(hasScope([], "leads:*")).toBe(false);
		});
	});

	describe("combined scopes", () => {
		it("should work with multiple specific scopes", () => {
			const scopes = ["leads:read", "leads:write", "webhooks:read"];
			expect(hasScope(scopes, "leads:read")).toBe(true);
			expect(hasScope(scopes, "leads:write")).toBe(true);
			expect(hasScope(scopes, "webhooks:read")).toBe(true);
			expect(hasScope(scopes, "leads:delete")).toBe(false);
			expect(hasScope(scopes, "webhooks:write")).toBe(false);
		});

		it("should prioritize wildcards appropriately", () => {
			const scopes = ["leads:read", "leads:*"];
			expect(hasScope(scopes, "leads:read")).toBe(true);
			expect(hasScope(scopes, "leads:write")).toBe(true);
			expect(hasScope(scopes, "leads:delete")).toBe(true);
		});
	});
});

describe("areValidScopes", () => {
	it("should return true for valid scopes", () => {
		expect(areValidScopes(["leads:read"])).toBe(true);
		expect(areValidScopes(["leads:write"])).toBe(true);
		expect(areValidScopes(["leads:delete"])).toBe(true);
		expect(areValidScopes(["leads:*"])).toBe(true);
		expect(areValidScopes(["contacts:read"])).toBe(true);
		expect(areValidScopes(["contacts:write"])).toBe(true);
		expect(areValidScopes(["contacts:delete"])).toBe(true);
		expect(areValidScopes(["contacts:*"])).toBe(true);
	});

	it("should return true for multiple valid scopes", () => {
		expect(areValidScopes(["leads:read", "leads:write"])).toBe(true);
		expect(areValidScopes(["leads:read", "leads:write", "leads:delete"])).toBe(true);
		expect(areValidScopes(["contacts:read", "contacts:write"])).toBe(true);
		expect(areValidScopes(["leads:read", "contacts:read"])).toBe(true);
	});

	it("should return false for invalid scopes", () => {
		expect(areValidScopes(["invalid:scope"])).toBe(false);
		expect(areValidScopes(["users:read"])).toBe(false);
		expect(areValidScopes(["*"])).toBe(false);
	});

	it("should return false if any scope is invalid", () => {
		expect(areValidScopes(["leads:read", "invalid:scope"])).toBe(false);
		expect(areValidScopes(["leads:read", "leads:write", "bad"])).toBe(false);
	});

	it("should return true for empty array", () => {
		expect(areValidScopes([])).toBe(true);
	});
});

describe("constantTimeCompare", () => {
	it("should return true for identical hashes", () => {
		const hash = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
		expect(constantTimeCompare(hash, hash)).toBe(true);
	});

	it("should return false for different hashes", () => {
		const hash1 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
		const hash2 = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";
		expect(constantTimeCompare(hash1, hash2)).toBe(false);
	});

	it("should return false for hashes of different lengths", () => {
		const hash1 = "a1b2c3d4e5f6";
		const hash2 = "a1b2c3d4e5f6a1b2";
		expect(constantTimeCompare(hash1, hash2)).toBe(false);
	});

	it("should return false for empty vs non-empty hash", () => {
		expect(
			constantTimeCompare("", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"),
		).toBe(false);
	});

	it("should return true for two empty hashes", () => {
		expect(constantTimeCompare("", "")).toBe(true);
	});

	it("should handle real SHA-256 hashes", () => {
		const key1 = "oct_testkey1234567890123456789012";
		const key2 = "oct_testkey1234567890123456789012";
		const hash1 = hashApiKey(key1);
		const hash2 = hashApiKey(key2);
		expect(constantTimeCompare(hash1, hash2)).toBe(true);
	});
});

describe("VALID_SCOPES constant", () => {
	it("should contain all defined scopes", () => {
		expect(VALID_SCOPES.has("leads:read")).toBe(true);
		expect(VALID_SCOPES.has("leads:write")).toBe(true);
		expect(VALID_SCOPES.has("leads:delete")).toBe(true);
		expect(VALID_SCOPES.has("leads:*")).toBe(true);
		expect(VALID_SCOPES.has("contacts:read")).toBe(true);
		expect(VALID_SCOPES.has("contacts:write")).toBe(true);
		expect(VALID_SCOPES.has("contacts:delete")).toBe(true);
		expect(VALID_SCOPES.has("contacts:*")).toBe(true);
	});

	it("should have exactly 12 scopes", () => {
		expect(VALID_SCOPES.size).toBe(12);
	});
});

describe("API_KEY_CONFIG constant", () => {
	it("should have correct prefix", () => {
		expect(API_KEY_CONFIG.prefix).toBe("oct_");
	});

	it("should have correct total length", () => {
		expect(API_KEY_CONFIG.totalLength).toBe(36);
	});

	it("should have correct random length", () => {
		expect(API_KEY_CONFIG.randomLength).toBe(32);
	});

	it("should have correct prefix display length", () => {
		expect(API_KEY_CONFIG.prefixDisplayLength).toBe(12);
	});

	it("should have consistent lengths (prefix + random = total)", () => {
		expect(API_KEY_CONFIG.prefix.length + API_KEY_CONFIG.randomLength).toBe(
			API_KEY_CONFIG.totalLength,
		);
	});
});

describe("Integration: generateApiKey and hashApiKey", () => {
	it("should generate keys that can be consistently hashed", () => {
		const { key, hash } = generateApiKey();
		const rehashedValue = hashApiKey(key);
		expect(hash).toBe(rehashedValue);
	});

	it("should generate valid keys that pass format validation", () => {
		for (let i = 0; i < 100; i++) {
			const { key } = generateApiKey();
			expect(isValidKeyFormat(key)).toBe(true);
		}
	});
});
