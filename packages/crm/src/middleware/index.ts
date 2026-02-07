/**
 * Middleware exports for the CRM API.
 */

export {
	extractBearerToken,
	getApiKeyFromContext,
	getRateLimitIdentifier,
	hasCurrentScope,
	optionalApiKey,
	requireApiKey,
	requireApiKeyFromContext,
	requireScope,
} from "./api-key.js";
export { errorHandler, notFoundHandler } from "./error-handler.js";
export {
	clearRateLimitStore,
	createLoginRateLimiter,
	createRateLimiter,
	getRateLimitEntry,
	RATE_LIMIT_CONFIG,
	rateLimiter,
} from "./rate-limit.js";
