/**
 * Error handling middleware for the CRM API.
 *
 * Catches all errors and converts them to consistent JSON responses
 * following the API spec in specs/07-api-endpoints.md.
 *
 * Features:
 * - Handles custom ApiError instances with proper status codes
 * - Handles Zod validation errors with field-level details
 * - Hides internal error details in production
 * - Logs all errors for debugging
 */

import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";
import { ApiError, ErrorCode, InternalError, ValidationError } from "../lib/errors.js";

/**
 * Check if an error is a Zod validation error.
 */
function isZodError(error: unknown): error is ZodError {
	return (
		error !== null &&
		typeof error === "object" &&
		"name" in error &&
		error.name === "ZodError" &&
		"issues" in error &&
		Array.isArray((error as ZodError).issues)
	);
}

/**
 * Convert Zod error to validation error with field details.
 */
function zodErrorToValidationError(error: ZodError): ValidationError {
	const details: Record<string, string> = {};

	for (const issue of error.issues) {
		const path = issue.path.join(".");
		const field = path || "value";
		details[field] = issue.message;
	}

	return new ValidationError("Validation failed", details);
}

/**
 * Main error handler middleware.
 * Converts any error to a standardized JSON response.
 */
export const errorHandler: ErrorHandler = (err: Error, c: Context) => {
	// Log the error (always log in development, only stack in dev)
	const isDev = process.env.NODE_ENV === "development";

	if (isDev) {
		console.error("Error:", err);
	} else {
		console.error("Error:", err.message);
	}

	// Handle Zod validation errors
	if (isZodError(err)) {
		const validationError = zodErrorToValidationError(err);
		return c.json(validationError.toJSON(), validationError.statusCode as ContentfulStatusCode);
	}

	// Handle our custom API errors
	if (err instanceof ApiError) {
		return c.json(err.toJSON(), err.statusCode as ContentfulStatusCode);
	}

	// Handle unknown errors - wrap in InternalError
	const internalError = new InternalError(isDev ? err.message : "Internal server error");

	return c.json(
		{
			error: internalError.message,
			code: ErrorCode.INTERNAL_ERROR,
		},
		500,
	);
};

/**
 * 404 Not Found handler for unmatched routes.
 */
export const notFoundHandler = (c: Context) => {
	return c.json(
		{
			error: "Not Found",
			code: ErrorCode.NOT_FOUND,
		},
		404,
	);
};
