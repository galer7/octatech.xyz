/**
 * Tests for custom error classes.
 *
 * Verifies that error classes produce correct status codes, error codes,
 * and JSON output per the API spec in specs/07-api-endpoints.md.
 */

import { describe, it, expect } from "vitest";
import {
  ApiError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  InvalidApiKeyError,
  InsufficientScopeError,
  NotFoundError,
  RateLimitedError,
  InternalError,
  ErrorCode,
} from "./errors";

describe("ErrorCode constants", () => {
  it("should have all required error codes per API spec", () => {
    expect(ErrorCode.INVALID_API_KEY).toBe("INVALID_API_KEY");
    expect(ErrorCode.INSUFFICIENT_SCOPE).toBe("INSUFFICIENT_SCOPE");
    expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.RATE_LIMITED).toBe("RATE_LIMITED");
    expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ErrorCode.BAD_REQUEST).toBe("BAD_REQUEST");
  });
});

describe("ApiError base class", () => {
  it("should create error with all properties", () => {
    const error = new ApiError("Test error", 400, ErrorCode.BAD_REQUEST, {
      field: "Invalid value",
    });

    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.details).toEqual({ field: "Invalid value" });
    expect(error.name).toBe("ApiError");
  });

  it("should serialize to JSON correctly", () => {
    const error = new ApiError("Test error", 400, ErrorCode.VALIDATION_ERROR, {
      email: "Invalid email format",
    });

    expect(error.toJSON()).toEqual({
      error: "Test error",
      code: "VALIDATION_ERROR",
      details: { email: "Invalid email format" },
    });
  });

  it("should omit details if empty", () => {
    const error = new ApiError("Test error", 400, ErrorCode.BAD_REQUEST);

    expect(error.toJSON()).toEqual({
      error: "Test error",
      code: "BAD_REQUEST",
    });
  });

  it("should be an instance of Error", () => {
    const error = new ApiError("Test", 400, ErrorCode.BAD_REQUEST);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("BadRequestError", () => {
  it("should have correct defaults", () => {
    const error = new BadRequestError();

    expect(error.message).toBe("Bad request");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.name).toBe("BadRequestError");
  });

  it("should accept custom message and details", () => {
    const error = new BadRequestError("Invalid input", { field: "error" });

    expect(error.message).toBe("Invalid input");
    expect(error.details).toEqual({ field: "error" });
  });
});

describe("ValidationError", () => {
  it("should have correct defaults", () => {
    const error = new ValidationError();

    expect(error.message).toBe("Validation failed");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.name).toBe("ValidationError");
  });

  it("should format per API spec", () => {
    const error = new ValidationError("Validation failed", {
      email: "Invalid email format",
      name: "Name is required",
    });

    expect(error.toJSON()).toEqual({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: {
        email: "Invalid email format",
        name: "Name is required",
      },
    });
  });
});

describe("UnauthorizedError", () => {
  it("should have correct defaults", () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe("Unauthorized");
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.name).toBe("UnauthorizedError");
  });
});

describe("InvalidApiKeyError", () => {
  it("should have correct defaults per API spec", () => {
    const error = new InvalidApiKeyError();

    expect(error.message).toBe("Invalid API key");
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("INVALID_API_KEY");
    expect(error.name).toBe("InvalidApiKeyError");
  });

  it("should format JSON per API spec", () => {
    const error = new InvalidApiKeyError();

    expect(error.toJSON()).toEqual({
      error: "Invalid API key",
      code: "INVALID_API_KEY",
    });
  });
});

describe("InsufficientScopeError", () => {
  it("should format message with required scope per API spec", () => {
    const error = new InsufficientScopeError("leads:write");

    expect(error.message).toBe(
      "Insufficient permissions. Required scope: leads:write"
    );
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("INSUFFICIENT_SCOPE");
    expect(error.requiredScope).toBe("leads:write");
    expect(error.name).toBe("InsufficientScopeError");
  });

  it("should format JSON per API spec", () => {
    const error = new InsufficientScopeError("leads:delete");

    expect(error.toJSON()).toEqual({
      error: "Insufficient permissions. Required scope: leads:delete",
      code: "INSUFFICIENT_SCOPE",
    });
  });
});

describe("NotFoundError", () => {
  it("should have correct defaults", () => {
    const error = new NotFoundError();

    expect(error.message).toBe("Resource not found");
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.name).toBe("NotFoundError");
  });

  it("should accept resource name per API spec", () => {
    const error = new NotFoundError("Lead");

    expect(error.message).toBe("Lead not found");
    expect(error.toJSON()).toEqual({
      error: "Lead not found",
      code: "NOT_FOUND",
    });
  });
});

describe("RateLimitedError", () => {
  it("should have correct status and code per API spec", () => {
    const error = new RateLimitedError(45);

    expect(error.message).toBe("Rate limit exceeded");
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfter).toBe(45);
    expect(error.name).toBe("RateLimitedError");
  });

  it("should format JSON with retryAfter per API spec", () => {
    const error = new RateLimitedError(30);

    expect(error.toJSON()).toEqual({
      error: "Rate limit exceeded",
      code: "RATE_LIMITED",
      retryAfter: 30,
    });
  });
});

describe("InternalError", () => {
  it("should have correct defaults", () => {
    const error = new InternalError();

    expect(error.message).toBe("Internal server error");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.name).toBe("InternalError");
  });

  it("should accept custom message", () => {
    const error = new InternalError("Database connection failed");

    expect(error.message).toBe("Database connection failed");
  });
});
