/**
 * Admin settings management routes.
 *
 * Implements GET and PATCH operations for system settings per specs/04-crm-admin-ui.md.
 * All routes require admin session authentication.
 *
 * Settings managed:
 * - cal_link: Cal.com booking link (e.g., "octatech/discovery")
 * - openai_api_key: OpenAI API key (masked in GET response)
 * - admin_email: Admin email address for notifications
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, settings } from "../../db/index.js";
import { BadRequestError, ValidationError } from "../../lib/errors.js";
import { requireAuth, requireCsrfHeader } from "../../middleware/auth.js";

/**
 * Admin settings routes app instance.
 */
export const adminSettingsRoutes = new Hono();

// All routes require admin authentication
adminSettingsRoutes.use("*", requireAuth);

/**
 * Regular expression for validating Cal.com link format.
 * Accepts formats like "username/event" or "team/username/event".
 */
const CAL_LINK_REGEX = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)+$/;

/**
 * Schema for updating settings.
 * All fields are optional - only provided fields will be updated.
 */
const updateSettingsSchema = z.object({
	cal_link: z
		.string()
		.refine((val) => CAL_LINK_REGEX.test(val), {
			message: 'Cal.com link must be in format "username/event" (e.g., "octatech/discovery")',
		})
		.optional(),
	openai_api_key: z
		.string()
		.min(1, "OpenAI API key cannot be empty")
		.refine((val) => val.startsWith("sk-"), {
			message: 'OpenAI API key must start with "sk-"',
		})
		.optional(),
	admin_email: z.string().email("Invalid email address").optional(),
});

/**
 * Mask a sensitive API key for display.
 * Shows the prefix and last 4 characters with dots in between.
 *
 * @param key - The API key to mask
 * @returns Masked key string (e.g., "sk-••••••••abcd")
 */
function maskApiKey(key: string): string {
	if (!key || key.length < 8) {
		return "••••••••";
	}

	// For OpenAI keys, show "sk-" prefix and last 4 chars
	if (key.startsWith("sk-")) {
		const suffix = key.slice(-4);
		return `sk-••••••••${suffix}`;
	}

	// Generic masking for other keys
	const prefix = key.slice(0, 3);
	const suffix = key.slice(-4);
	return `${prefix}••••••••${suffix}`;
}

/**
 * Parse and validate request body with Zod schema.
 * Returns validation errors in a consistent format.
 *
 * @param schema - The Zod schema to validate against
 * @param body - The request body to validate
 * @returns The validated and typed data
 * @throws ValidationError if validation fails
 */
function parseAndValidate<T>(schema: z.ZodSchema<T>, body: unknown): T {
	const parseResult = schema.safeParse(body);

	if (!parseResult.success) {
		const errors: Record<string, string> = {};
		for (const issue of parseResult.error.issues) {
			const field = issue.path[0]?.toString() || "unknown";
			errors[field] = issue.message;
		}
		throw new ValidationError("Invalid request", errors);
	}

	return parseResult.data;
}

/**
 * GET /api/admin/settings
 *
 * Return all settings as an object with keys mapped to their values.
 * Sensitive values (like OpenAI API key) are masked for security.
 *
 * @response 200 - Settings object
 */
adminSettingsRoutes.get("/", async (c) => {
	// Fetch each setting individually
	const [calLinkSetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "cal_link"))
		.limit(1);

	const [openaiKeySetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "openai_api_key"))
		.limit(1);

	const [adminEmailSetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "admin_email"))
		.limit(1);

	// Build response object with all settings
	const response: Record<string, unknown> = {
		cal_link: calLinkSetting?.value ?? null,
		openai_api_key: openaiKeySetting?.value ? maskApiKey(openaiKeySetting.value as string) : null,
		admin_email: adminEmailSetting?.value ?? null,
	};

	return c.json({
		settings: response,
	});
});

/**
 * PATCH /api/admin/settings
 *
 * Update one or more settings.
 * Only provided fields will be updated (partial update).
 * Uses upsert to handle cases where settings don't exist yet.
 *
 * @body cal_link - Cal.com booking link (optional)
 * @body openai_api_key - OpenAI API key (optional)
 * @body admin_email - Admin email address (optional)
 * @response 200 - Updated settings
 */
adminSettingsRoutes.patch("/", requireCsrfHeader, async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = parseAndValidate(updateSettingsSchema, body);

	// Check if there's anything to update
	if (
		data.cal_link === undefined &&
		data.openai_api_key === undefined &&
		data.admin_email === undefined
	) {
		throw new BadRequestError(
			"At least one setting (cal_link, openai_api_key, or admin_email) is required",
		);
	}

	const now = new Date();

	// Update each provided setting using upsert
	if (data.cal_link !== undefined) {
		await db
			.insert(settings)
			.values({
				key: "cal_link",
				value: data.cal_link,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: {
					value: data.cal_link,
					updatedAt: now,
				},
			});
	}

	if (data.openai_api_key !== undefined) {
		await db
			.insert(settings)
			.values({
				key: "openai_api_key",
				value: data.openai_api_key,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: {
					value: data.openai_api_key,
					updatedAt: now,
				},
			});
	}

	if (data.admin_email !== undefined) {
		await db
			.insert(settings)
			.values({
				key: "admin_email",
				value: data.admin_email,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: settings.key,
				set: {
					value: data.admin_email,
					updatedAt: now,
				},
			});
	}

	// Fetch all settings to return the complete state
	const [calLinkSetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "cal_link"))
		.limit(1);

	const [openaiKeySetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "openai_api_key"))
		.limit(1);

	const [adminEmailSetting] = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "admin_email"))
		.limit(1);

	return c.json({
		settings: {
			cal_link: calLinkSetting?.value ?? null,
			openai_api_key: openaiKeySetting?.value ? maskApiKey(openaiKeySetting.value as string) : null,
			admin_email: adminEmailSetting?.value ?? null,
		},
	});
});
