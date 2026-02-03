/**
 * Custom error classes and error codes for the CRM API.
 *
 * These errors are used throughout the application and are handled
 * by the error middleware to return consistent JSON error responses.
 *
 * Error codes follow the API spec in specs/07-api-endpoints.md
 */

/**
 * Standard error codes used across the API.
 * These map to specific HTTP status codes and error messages.
 */
export const ErrorCode = {
  INVALID_API_KEY: "INVALID_API_KEY",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  BAD_REQUEST: "BAD_REQUEST",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base class for all API errors.
 * Extends Error and adds HTTP status code and error code fields.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeType;
  public readonly details?: Record<string, string>;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCodeType,
    details?: Record<string, string>
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Convert error to JSON response format per API spec.
   */
  toJSON(): {
    error: string;
    code: string;
    details?: Record<string, string>;
  } {
    const response: { error: string; code: string; details?: Record<string, string> } = {
      error: this.message,
      code: this.code,
    };

    if (this.details && Object.keys(this.details).length > 0) {
      response.details = this.details;
    }

    return response;
  }
}

/**
 * 400 Bad Request - Invalid request format or parameters
 */
export class BadRequestError extends ApiError {
  constructor(message = "Bad request", details?: Record<string, string>) {
    super(message, 400, ErrorCode.BAD_REQUEST, details);
    this.name = "BadRequestError";
  }
}

/**
 * 400 Validation Error - Request body validation failed
 */
export class ValidationError extends ApiError {
  constructor(message = "Validation failed", details?: Record<string, string>) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    this.name = "ValidationError";
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, 401, ErrorCode.UNAUTHORIZED);
    this.name = "UnauthorizedError";
  }
}

/**
 * 401 Invalid API Key - API key is missing, malformed, or revoked
 */
export class InvalidApiKeyError extends ApiError {
  constructor(message = "Invalid API key") {
    super(message, 401, ErrorCode.INVALID_API_KEY);
    this.name = "InvalidApiKeyError";
  }
}

/**
 * 403 Forbidden - Insufficient permissions/scope
 */
export class InsufficientScopeError extends ApiError {
  public readonly requiredScope: string;

  constructor(requiredScope: string) {
    super(
      `Insufficient permissions. Required scope: ${requiredScope}`,
      403,
      ErrorCode.INSUFFICIENT_SCOPE
    );
    this.name = "InsufficientScopeError";
    this.requiredScope = requiredScope;
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends ApiError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, ErrorCode.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

/**
 * 429 Rate Limited - Too many requests
 */
export class RateLimitedError extends ApiError {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("Rate limit exceeded", 429, ErrorCode.RATE_LIMITED);
    this.name = "RateLimitedError";
    this.retryAfter = retryAfter;
  }

  override toJSON(): {
    error: string;
    code: string;
    retryAfter: number;
  } {
    return {
      error: this.message,
      code: this.code,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalError extends ApiError {
  constructor(message = "Internal server error") {
    super(message, 500, ErrorCode.INTERNAL_ERROR);
    this.name = "InternalError";
  }
}
