/**
 * Middleware exports for the CRM API.
 */

export { errorHandler, notFoundHandler } from "./error-handler";
export {
  rateLimiter,
  createRateLimiter,
  createLoginRateLimiter,
  RATE_LIMIT_CONFIG,
  clearRateLimitStore,
  getRateLimitEntry,
} from "./rate-limit";
export {
  requireApiKey,
  optionalApiKey,
  requireScope,
  extractBearerToken,
  getApiKeyFromContext,
  requireApiKeyFromContext,
  hasCurrentScope,
  getRateLimitIdentifier,
} from "./api-key";
