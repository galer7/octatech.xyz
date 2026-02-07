/**
 * API Key utilities for the CRM API.
 *
 * Implements secure key generation, hashing, validation, and scope checking
 * per specs/06-api-keys.md.
 *
 * Security considerations:
 * - Keys are generated with cryptographically secure randomness
 * - Only SHA-256 hashes are stored in the database
 * - Full keys are only displayed once at creation time
 * - Constant-time comparison prevents timing attacks
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { type ApiKey, type ApiKeyScope, apiKeyScopeEnum, apiKeys } from "../db/schema.js";

/**
 * API key format constants.
 * Format: oct_[32 base62 characters]
 * Total length: 36 characters
 */
export const API_KEY_CONFIG = {
	prefix: "oct_",
	randomLength: 32,
	totalLength: 36,
	prefixDisplayLength: 12,
} as const;

/**
 * Base62 character set for key generation.
 * Includes lowercase, uppercase letters, and digits.
 */
const BASE62_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Valid API key scopes as a Set for fast lookup.
 */
export const VALID_SCOPES = new Set<string>(apiKeyScopeEnum);

/**
 * Generate a cryptographically secure random API key.
 *
 * The key format is: oct_[32 base62 characters]
 * - Total length: 36 characters
 * - Prefix: oct_ for easy identification
 * - Random part: 32 base62 characters (~190 bits of entropy)
 *
 * @returns Object containing the full key, its SHA-256 hash, and display prefix
 *
 * @example
 * ```ts
 * const { key, hash, prefix } = generateApiKey();
 * // key: oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 * // hash: 64-char hex string
 * // prefix: oct_a1b2...
 * ```
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
	// Generate 32 random bytes (more than enough entropy for 32 base62 chars)
	const bytes = randomBytes(32);

	// Convert to base62
	let randomPart = "";
	for (let i = 0; i < API_KEY_CONFIG.randomLength; i++) {
		// Use modulo to map each byte to a base62 character
		// This has a slight bias but is acceptable for our use case
		randomPart += BASE62_CHARSET[bytes[i] % 62];
	}

	const key = `${API_KEY_CONFIG.prefix}${randomPart}`;
	const hash = hashApiKey(key);
	const prefix = `${key.substring(0, API_KEY_CONFIG.prefixDisplayLength)}...`;

	return { key, hash, prefix };
}

/**
 * Hash an API key using SHA-256.
 *
 * @param key - The full API key to hash
 * @returns Hexadecimal hash string (64 characters)
 *
 * @example
 * ```ts
 * const hash = hashApiKey("oct_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6");
 * ```
 */
export function hashApiKey(key: string): string {
	return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key format.
 *
 * @param key - The API key to validate
 * @returns true if the key has valid format, false otherwise
 *
 * @example
 * ```ts
 * isValidKeyFormat("oct_abc123..."); // true
 * isValidKeyFormat("invalid_key"); // false
 * ```
 */
export function isValidKeyFormat(key: string): boolean {
	// Check prefix
	if (!key.startsWith(API_KEY_CONFIG.prefix)) {
		return false;
	}

	// Check total length
	if (key.length !== API_KEY_CONFIG.totalLength) {
		return false;
	}

	// Check that random part only contains base62 characters
	const randomPart = key.substring(API_KEY_CONFIG.prefix.length);
	for (const char of randomPart) {
		if (!BASE62_CHARSET.includes(char)) {
			return false;
		}
	}

	return true;
}

/**
 * Result of API key validation.
 */
export interface ValidatedApiKey {
	id: string;
	name: string;
	keyPrefix: string;
	scopes: string[];
	lastUsedAt: Date | null;
	createdAt: Date;
}

/**
 * Validate an API key against the database.
 *
 * This function:
 * 1. Validates the key format
 * 2. Hashes the key
 * 3. Looks up the hash in the database
 * 4. Checks the key is not revoked
 * 5. Updates the last_used_at timestamp
 *
 * @param key - The API key to validate
 * @returns The API key record if valid, null otherwise
 *
 * @example
 * ```ts
 * const apiKey = await validateApiKey("oct_abc123...");
 * if (!apiKey) {
 *   throw new InvalidApiKeyError();
 * }
 * ```
 */
export async function validateApiKey(key: string): Promise<ValidatedApiKey | null> {
	// Check format first (fast path for invalid keys)
	if (!isValidKeyFormat(key)) {
		return null;
	}

	// Hash the key
	const keyHash = hashApiKey(key);

	// Look up in database
	const [apiKey] = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
		.limit(1);

	if (!apiKey) {
		return null;
	}

	// Update last used timestamp asynchronously (don't block validation)
	updateLastUsed(apiKey.id).catch((error) => {
		console.error("Failed to update API key last_used_at:", error);
	});

	return {
		id: apiKey.id,
		name: apiKey.name,
		keyPrefix: apiKey.keyPrefix,
		scopes: apiKey.scopes,
		lastUsedAt: apiKey.lastUsedAt,
		createdAt: apiKey.createdAt,
	};
}

/**
 * Update the last_used_at timestamp for an API key.
 *
 * @param keyId - The API key ID
 */
async function updateLastUsed(keyId: string): Promise<void> {
	await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, keyId));
}

/**
 * Check if an API key has a required scope.
 *
 * Scope checking rules:
 * - Exact match: scope === requiredScope
 * - Resource wildcard: scope === "resource:*" matches any action on that resource
 * - Global wildcard: scope === "*" matches everything
 *
 * @param scopes - The scopes granted to the API key
 * @param requiredScope - The scope required for the operation
 * @returns true if the key has the required scope
 *
 * @example
 * ```ts
 * hasScope(["leads:read", "leads:write"], "leads:read"); // true
 * hasScope(["leads:*"], "leads:delete"); // true
 * hasScope(["leads:read"], "leads:write"); // false
 * ```
 */
export function hasScope(scopes: string[], requiredScope: string): boolean {
	// Parse the required scope
	const [resource] = requiredScope.split(":");

	return scopes.some((scope) => {
		// Exact match
		if (scope === requiredScope) {
			return true;
		}

		// Resource wildcard (e.g., leads:* matches leads:read)
		if (scope === `${resource}:*`) {
			return true;
		}

		// Global wildcard
		if (scope === "*") {
			return true;
		}

		return false;
	});
}

/**
 * Check if all provided scopes are valid.
 *
 * @param scopes - Array of scope strings to validate
 * @returns true if all scopes are valid
 *
 * @example
 * ```ts
 * areValidScopes(["leads:read", "leads:write"]); // true
 * areValidScopes(["invalid:scope"]); // false
 * ```
 */
export function areValidScopes(scopes: string[]): boolean {
	return scopes.every((scope) => VALID_SCOPES.has(scope));
}

/**
 * Options for creating an API key.
 */
export interface CreateApiKeyOptions {
	name: string;
	scopes: ApiKeyScope[];
}

/**
 * Result of creating an API key.
 * The full key is only available at creation time.
 */
export interface CreateApiKeyResult {
	id: string;
	name: string;
	key: string; // Full key - only shown once!
	keyPrefix: string;
	scopes: string[];
	createdAt: Date;
}

/**
 * Create a new API key.
 *
 * The full key is returned only at creation time and cannot be retrieved later.
 * Only the hash is stored in the database.
 *
 * @param options - Key creation options
 * @returns The created key with the full key (shown only once)
 *
 * @example
 * ```ts
 * const result = await createApiKey({
 *   name: "Claude Bot",
 *   scopes: ["leads:read", "leads:write"],
 * });
 * // Save result.key securely - it won't be shown again!
 * ```
 */
export async function createApiKey(options: CreateApiKeyOptions): Promise<CreateApiKeyResult> {
	const { name, scopes } = options;

	// Generate the key
	const { key, hash, prefix } = generateApiKey();

	// Insert into database
	const [created] = await db
		.insert(apiKeys)
		.values({
			name,
			keyHash: hash,
			keyPrefix: prefix,
			scopes: scopes,
		})
		.returning();

	return {
		id: created.id,
		name: created.name,
		key, // Full key - only shown once!
		keyPrefix: created.keyPrefix,
		scopes: created.scopes,
		createdAt: created.createdAt,
	};
}

/**
 * Options for listing API keys.
 */
export interface ListApiKeysOptions {
	includeRevoked?: boolean;
}

/**
 * API key record for listing (excludes the actual key).
 */
export interface ApiKeyListItem {
	id: string;
	name: string;
	keyPrefix: string;
	scopes: string[];
	lastUsedAt: Date | null;
	createdAt: Date;
	revokedAt: Date | null;
}

/**
 * List all API keys.
 *
 * @param options - List options
 * @returns Array of API key records (without the actual keys)
 *
 * @example
 * ```ts
 * const keys = await listApiKeys();
 * // keys.forEach(key => console.log(key.name, key.keyPrefix));
 * ```
 */
export async function listApiKeys(options: ListApiKeysOptions = {}): Promise<ApiKeyListItem[]> {
	const { includeRevoked = false } = options;

	let query = db.select().from(apiKeys);

	if (!includeRevoked) {
		query = query.where(isNull(apiKeys.revokedAt)) as typeof query;
	}

	const keys = await query;

	return keys.map((key) => ({
		id: key.id,
		name: key.name,
		keyPrefix: key.keyPrefix,
		scopes: key.scopes,
		lastUsedAt: key.lastUsedAt,
		createdAt: key.createdAt,
		revokedAt: key.revokedAt,
	}));
}

/**
 * Get an API key by ID.
 *
 * @param id - The API key ID
 * @returns The API key record or null if not found
 *
 * @example
 * ```ts
 * const key = await getApiKey("uuid-here");
 * if (!key) throw new NotFoundError("API key");
 * ```
 */
export async function getApiKey(id: string): Promise<ApiKeyListItem | null> {
	const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);

	if (!key) {
		return null;
	}

	return {
		id: key.id,
		name: key.name,
		keyPrefix: key.keyPrefix,
		scopes: key.scopes,
		lastUsedAt: key.lastUsedAt,
		createdAt: key.createdAt,
		revokedAt: key.revokedAt,
	};
}

/**
 * Options for updating an API key.
 */
export interface UpdateApiKeyOptions {
	name?: string;
	scopes?: ApiKeyScope[];
}

/**
 * Update an API key's name and/or scopes.
 *
 * @param id - The API key ID
 * @param options - Update options
 * @returns The updated key record or null if not found
 *
 * @example
 * ```ts
 * const updated = await updateApiKey("uuid", {
 *   name: "Claude Bot v2",
 *   scopes: ["leads:*"],
 * });
 * ```
 */
export async function updateApiKey(
	id: string,
	options: UpdateApiKeyOptions,
): Promise<ApiKeyListItem | null> {
	const updates: Partial<Pick<ApiKey, "name" | "scopes">> = {};

	if (options.name !== undefined) {
		updates.name = options.name;
	}

	if (options.scopes !== undefined) {
		updates.scopes = options.scopes;
	}

	// If no updates, just fetch the current record
	if (Object.keys(updates).length === 0) {
		return getApiKey(id);
	}

	const [updated] = await db.update(apiKeys).set(updates).where(eq(apiKeys.id, id)).returning();

	if (!updated) {
		return null;
	}

	return {
		id: updated.id,
		name: updated.name,
		keyPrefix: updated.keyPrefix,
		scopes: updated.scopes,
		lastUsedAt: updated.lastUsedAt,
		createdAt: updated.createdAt,
		revokedAt: updated.revokedAt,
	};
}

/**
 * Revoke an API key.
 *
 * This performs a soft delete by setting revoked_at timestamp.
 * The key immediately becomes invalid but the record is preserved for audit.
 *
 * @param id - The API key ID
 * @returns true if revoked, false if not found or already revoked
 *
 * @example
 * ```ts
 * const revoked = await revokeApiKey("uuid-here");
 * if (!revoked) throw new NotFoundError("API key");
 * ```
 */
export async function revokeApiKey(id: string): Promise<boolean> {
	const [revoked] = await db
		.update(apiKeys)
		.set({ revokedAt: new Date() })
		.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
		.returning();

	return !!revoked;
}

/**
 * Permanently delete an API key.
 *
 * Use revokeApiKey instead for most cases to preserve audit trail.
 * This function is primarily for cleanup of test data.
 *
 * @param id - The API key ID
 * @returns true if deleted, false if not found
 */
export async function deleteApiKey(id: string): Promise<boolean> {
	const [deleted] = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning();

	return !!deleted;
}

/**
 * Compare two hashes in constant time to prevent timing attacks.
 *
 * @param hash1 - First hash (hex string)
 * @param hash2 - Second hash (hex string)
 * @returns true if hashes match
 */
export function constantTimeCompare(hash1: string, hash2: string): boolean {
	if (hash1.length !== hash2.length) {
		return false;
	}

	const buf1 = Buffer.from(hash1, "hex");
	const buf2 = Buffer.from(hash2, "hex");

	return timingSafeEqual(buf1, buf2);
}
