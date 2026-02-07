/**
 * Middleware exports for the CRM API.
 */

export { errorHandler, notFoundHandler } from "./error-handler.js";
export {
  rateLimiter,
  createRateLimiter,
  createLoginRateLimiter,
  RATE_LIMIT_CONFIG,
  clearRateLimitStore,
  getRateLimitEntry,
} from "./rate-limit.js";
export {
  requireApiKey,
  optionalApiKey,
  requireScope,
  extractBearerToken,
  getApiKeyFromContext,
  requireApiKeyFromContext,
  hasCurrentScope,
  getRateLimitIdentifier,
} from "./api-key.js";
