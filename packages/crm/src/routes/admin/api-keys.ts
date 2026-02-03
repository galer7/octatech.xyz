/**
 * Admin API key management routes.
 *
 * Implements CRUD operations for API keys per specs/06-api-keys.md.
 * All routes require admin session authentication.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  createApiKey,
  listApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  VALID_SCOPES,
} from "../../lib/api-keys";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth";
import { ValidationError, NotFoundError, BadRequestError } from "../../lib/errors";
import { apiKeyScopeEnum, type ApiKeyScope } from "../../db/schema";

/**
 * Admin API keys routes app instance.
 */
export const adminApiKeysRoutes = new Hono();

// All routes require admin authentication
adminApiKeysRoutes.use("*", requireAuth);

/**
 * Schema for creating an API key.
 */
const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be at most 255 characters"),
  scopes: z
    .array(z.enum(apiKeyScopeEnum))
    .min(1, "At least one scope is required"),
});

/**
 * Schema for updating an API key.
 */
const updateApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(255, "Name must be at most 255 characters")
    .optional(),
  scopes: z
    .array(z.enum(apiKeyScopeEnum))
    .min(1, "At least one scope is required")
    .optional(),
});

/**
 * GET /api/admin/api-keys
 *
 * List all API keys.
 * Returns keys with prefix, name, scopes, last used, but NOT the actual key.
 *
 * @response 200 - List of API keys
 */
adminApiKeysRoutes.get("/", async (c) => {
  const includeRevoked = c.req.query("includeRevoked") === "true";

  const keys = await listApiKeys({ includeRevoked });

  return c.json({
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt?.toISOString() || null,
      createdAt: key.createdAt.toISOString(),
      revokedAt: key.revokedAt?.toISOString() || null,
    })),
  });
});

/**
 * GET /api/admin/api-keys/:id
 *
 * Get a single API key by ID.
 *
 * @param id - The API key ID (UUID)
 * @response 200 - The API key
 * @response 404 - API key not found
 */
adminApiKeysRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");

  const key = await getApiKey(id);

  if (!key) {
    throw new NotFoundError("API key");
  }

  return c.json({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt?.toISOString() || null,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() || null,
  });
});

/**
 * POST /api/admin/api-keys
 *
 * Create a new API key.
 * Returns the full key ONLY ONCE - it cannot be retrieved again.
 *
 * @body name - Friendly name for the key (e.g., "Claude Bot")
 * @body scopes - Array of permission scopes
 * @response 201 - Created key with full key value
 */
adminApiKeysRoutes.post("/", requireCsrfHeader, async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = createApiKeySchema.safeParse(body);

  if (!parseResult.success) {
    const errors: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path[0]?.toString() || "unknown";
      errors[field] = issue.message;
    }
    throw new ValidationError("Invalid request", errors);
  }

  const { name, scopes } = parseResult.data;

  // Create the key
  const result = await createApiKey({
    name,
    scopes: scopes as ApiKeyScope[],
  });

  return c.json(
    {
      id: result.id,
      name: result.name,
      key: result.key, // Full key - only shown once!
      keyPrefix: result.keyPrefix,
      scopes: result.scopes,
      createdAt: result.createdAt.toISOString(),
    },
    201
  );
});

/**
 * PATCH /api/admin/api-keys/:id
 *
 * Update an API key's name and/or scopes.
 *
 * @param id - The API key ID (UUID)
 * @body name - New name (optional)
 * @body scopes - New scopes (optional)
 * @response 200 - Updated key
 * @response 404 - API key not found
 */
adminApiKeysRoutes.patch("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = updateApiKeySchema.safeParse(body);

  if (!parseResult.success) {
    const errors: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path[0]?.toString() || "unknown";
      errors[field] = issue.message;
    }
    throw new ValidationError("Invalid request", errors);
  }

  const { name, scopes } = parseResult.data;

  // Check if there's anything to update
  if (name === undefined && scopes === undefined) {
    throw new BadRequestError("At least one field (name or scopes) is required");
  }

  // Check if key exists and is not revoked
  const existingKey = await getApiKey(id);
  if (!existingKey) {
    throw new NotFoundError("API key");
  }

  if (existingKey.revokedAt) {
    throw new BadRequestError("Cannot update a revoked API key");
  }

  // Update the key
  const updated = await updateApiKey(id, {
    name,
    scopes: scopes as ApiKeyScope[] | undefined,
  });

  if (!updated) {
    throw new NotFoundError("API key");
  }

  return c.json({
    id: updated.id,
    name: updated.name,
    keyPrefix: updated.keyPrefix,
    scopes: updated.scopes,
    lastUsedAt: updated.lastUsedAt?.toISOString() || null,
    createdAt: updated.createdAt.toISOString(),
  });
});

/**
 * DELETE /api/admin/api-keys/:id
 *
 * Revoke an API key.
 * This is a soft delete - the key record is preserved for audit but becomes invalid.
 *
 * @param id - The API key ID (UUID)
 * @response 200 - Key revoked
 * @response 404 - API key not found or already revoked
 */
adminApiKeysRoutes.delete("/:id", requireCsrfHeader, async (c) => {
  const id = c.req.param("id");

  const revoked = await revokeApiKey(id);

  if (!revoked) {
    // Check if it exists but is already revoked
    const key = await getApiKey(id);
    if (key?.revokedAt) {
      throw new BadRequestError("API key is already revoked");
    }
    throw new NotFoundError("API key");
  }

  return c.json({
    success: true,
    message: "API key revoked",
  });
});

/**
 * GET /api/admin/api-keys/scopes
 *
 * List all available API key scopes.
 * Useful for populating UI dropdowns.
 *
 * @response 200 - List of scopes with descriptions
 */
adminApiKeysRoutes.get("/scopes/list", async (c) => {
  const scopeDescriptions: Record<string, string> = {
    "leads:read": "Read lead information",
    "leads:write": "Create and update leads",
    "leads:delete": "Delete leads",
    "leads:*": "All lead permissions",
  };

  const scopes = Array.from(VALID_SCOPES).map((scope) => ({
    scope,
    description: scopeDescriptions[scope] || scope,
  }));

  return c.json({ scopes });
});
