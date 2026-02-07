/**
 * API info endpoint.
 *
 * Returns information about the current API key.
 * Per specs/07-api-endpoints.md.
 */

import { Hono } from "hono";
import { requireApiKey, requireApiKeyFromContext } from "../../middleware/api-key.js";

/**
 * API info routes app instance.
 */
export const meRoutes = new Hono();

/**
 * GET /api/v1/me
 *
 * Get information about the current API key.
 * Requires any valid API key.
 */
meRoutes.get("/", requireApiKey, async (c) => {
	const apiKey = requireApiKeyFromContext(c);

	return c.json({
		keyPrefix: apiKey.keyPrefix,
		name: apiKey.name,
		scopes: apiKey.scopes,
		createdAt: apiKey.createdAt.toISOString(),
	});
});
