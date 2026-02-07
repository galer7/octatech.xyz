/**
 * Tests for public leads endpoint (contact form submissions).
 *
 * Verifies lead creation, validation, and honeypot spam protection
 * per specs/02-contact-form.md.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock db connection BEFORE imports
vi.mock("../../db/connection", () => {
	// Create a chainable mock for drizzle insert
	const mockReturning = vi.fn();
	const mockValues = vi.fn(() => ({ returning: mockReturning }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));

	return {
		db: {
			insert: mockInsert,
		},
	};
});

import { db } from "../../db/connection";
import { errorHandler } from "../../middleware/error-handler";
// Import after mocking
import { publicLeadsRoutes } from "./public-leads";

// Cast to mock types for type safety
const mockDb = db as unknown as {
	insert: ReturnType<typeof vi.fn> & {
		mockImplementation: (fn: unknown) => void;
	};
};

/**
 * Helper to create a valid lead payload.
 */
function createValidLeadPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		name: "John Doe",
		email: "john@example.com",
		message: "I need help building a custom CRM system for my business.",
		...overrides,
	};
}

/**
 * Helper to create a chainable mock for db.insert.
 * Each insert() call needs its own chain of values().returning()
 */
function setupDbMock(
	options: { leadId?: string; shouldFail?: boolean; errorMessage?: string } = {},
) {
	const {
		leadId = "test-lead-id-123",
		shouldFail = false,
		errorMessage = "Database error",
	} = options;

	// Track all mock calls for verification
	const allValuesCalls: unknown[] = [];
	const _allReturningCalls: unknown[] = [];

	// Create separate returning mocks for lead and activity inserts
	const leadReturning = vi.fn();
	const activityReturning = vi.fn();

	if (shouldFail) {
		leadReturning.mockRejectedValue(new Error(errorMessage));
	} else {
		leadReturning.mockResolvedValue([{ id: leadId, name: "John Doe", email: "john@example.com" }]);
		activityReturning.mockResolvedValue([{ id: "activity-id-123" }]);
	}

	// Create separate values mocks that track their args
	const leadValues = vi.fn((args) => {
		allValuesCalls.push(args);
		return { returning: leadReturning };
	});
	const activityValues = vi.fn((args) => {
		allValuesCalls.push(args);
		return { returning: activityReturning };
	});

	// Mock insert to return different chains for each call
	let insertCallCount = 0;
	mockDb.insert.mockImplementation(() => {
		insertCallCount++;
		if (insertCallCount === 1) {
			return { values: leadValues };
		} else {
			return { values: activityValues };
		}
	});

	// Create a combined mock values object for test assertions
	const mockValues = {
		mock: {
			get calls() {
				return [...(leadValues.mock.calls || []), ...(activityValues.mock.calls || [])];
			},
		},
	} as unknown as ReturnType<typeof vi.fn>;

	// Add toHaveBeenCalledTimes to mockValues
	Object.defineProperty(mockValues, "toHaveBeenCalledTimes", {
		value: () => leadValues.mock.calls.length + activityValues.mock.calls.length,
	});

	return {
		mockInsert: mockDb.insert,
		mockValues,
		mockReturning: { leadReturning, activityReturning },
		leadValues,
		activityValues,
	};
}

describe("Public Leads Routes", () => {
	let app: Hono;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create app with routes
		app = new Hono();
		app.route("/api/leads", publicLeadsRoutes);
		app.onError(errorHandler);

		// Spy on console.log to verify spam logging
		consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	describe("POST /api/leads", () => {
		describe("Successful lead creation", () => {
			it("should create a lead with minimal required fields (201)", async () => {
				const { leadValues, activityValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body).toEqual({
					success: true,
					message: "Thank you! We'll be in touch within 24 hours.",
				});

				// Verify db.insert was called for leads and activities
				expect(leadValues).toHaveBeenCalledTimes(1);
				expect(activityValues).toHaveBeenCalledTimes(1);
			});

			it("should create a lead with all optional fields", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					company: "Acme Corp",
					phone: "+1 (555) 123-4567",
					budget: "$15,000 - $50,000",
					projectType: "New Product / MVP",
					source: "Google Search",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body.success).toBe(true);

				// Verify all optional fields were passed to the database
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs).toMatchObject({
					name: "John Doe",
					email: "john@example.com",
					company: "Acme Corp",
					phone: "+1 (555) 123-4567",
					budget: "$15,000 - $50,000",
					projectType: "New Product / MVP",
					source: "Google Search",
					status: "new",
				});
			});

			it("should use 'Contact Form' as default source when not provided", async () => {
				const { leadValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.source).toBe("Contact Form");
			});

			it("should set status to 'new' by default", async () => {
				const { leadValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.status).toBe("new");
			});

			it("should create an activity log entry with client IP", async () => {
				const { activityValues } = setupDbMock({ leadId: "lead-with-activity" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Real-IP": "192.168.1.100",
					},
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				// Activity insert call
				const activityCallArgs = activityValues.mock.calls[0][0];
				expect(activityCallArgs).toMatchObject({
					leadId: "lead-with-activity",
					type: "note",
					description: expect.stringContaining("192.168.1.100"),
				});
			});

			it("should use CF-Connecting-IP header when available", async () => {
				const { activityValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"CF-Connecting-IP": "203.0.113.50",
						"X-Real-IP": "192.168.1.1",
					},
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				const activityCallArgs = activityValues.mock.calls[0][0];
				expect(activityCallArgs.description).toContain("203.0.113.50");
			});

			it("should parse X-Forwarded-For header correctly", async () => {
				const { activityValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Forwarded-For": "10.0.0.1, 10.0.0.2, 10.0.0.3",
					},
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				const activityCallArgs = activityValues.mock.calls[0][0];
				expect(activityCallArgs.description).toContain("10.0.0.1");
			});

			it("should handle null optional fields correctly", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					company: null,
					phone: null,
					budget: null,
					projectType: null,
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);

				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.company).toBeNull();
				expect(insertCallArgs.phone).toBeNull();
				expect(insertCallArgs.budget).toBeNull();
				expect(insertCallArgs.projectType).toBeNull();
			});
		});

		describe("Validation errors", () => {
			it("should return 400 when name is missing", async () => {
				const payload = createValidLeadPayload();
				delete payload.name;

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
				expect(body.errors.name).toBeDefined();
			});

			it("should return 400 when name is too short", async () => {
				const payload = createValidLeadPayload({ name: "J" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.name).toContain("at least 2 characters");
			});

			it("should return 400 when email is missing", async () => {
				const payload = createValidLeadPayload();
				delete payload.email;

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.email).toBeDefined();
			});

			it("should return 400 for invalid email format", async () => {
				const payload = createValidLeadPayload({ email: "not-an-email" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.email).toContain("Invalid email");
			});

			it("should return 400 for email without domain", async () => {
				const payload = createValidLeadPayload({ email: "john@" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.email).toBeDefined();
			});

			it("should return 400 when message is missing", async () => {
				const payload = createValidLeadPayload();
				delete payload.message;

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.message).toBeDefined();
			});

			it("should return 400 when message is too short", async () => {
				const payload = createValidLeadPayload({ message: "Hi" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.message).toContain("at least 10 characters");
			});

			it("should return 400 when message exceeds maximum length", async () => {
				const payload = createValidLeadPayload({ message: "x".repeat(5001) });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.message).toContain("5000 characters");
			});

			it("should return 400 for invalid phone format", async () => {
				const payload = createValidLeadPayload({ phone: "abc-not-a-phone" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.phone).toContain("Invalid phone format");
			});

			it("should return 400 with multiple validation errors", async () => {
				const payload = {
					name: "J",
					email: "invalid",
					message: "short",
				};

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(Object.keys(body.errors).length).toBeGreaterThanOrEqual(3);
			});

			it("should return 400 when request body is empty", async () => {
				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});

			it("should return 400 when request body is invalid JSON", async () => {
				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not valid json",
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
			});

			it("should return 400 when name exceeds maximum length", async () => {
				const payload = createValidLeadPayload({ name: "x".repeat(256) });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.name).toContain("255 characters");
			});

			it("should return 400 when email exceeds maximum length", async () => {
				const longEmail = `${"x".repeat(250)}@example.com`;
				const payload = createValidLeadPayload({ email: longEmail });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors.email).toBeDefined();
			});
		});

		describe("Honeypot spam protection", () => {
			it("should return 201 success when honeypot is filled (to trick bots)", async () => {
				// Note: We do NOT call setupDbMock here because db should NOT be called
				const payload = createValidLeadPayload({
					website: "http://spam-bot-filled-this.com",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body).toEqual({
					success: true,
					message: "Thank you! We'll be in touch within 24 hours.",
				});
			});

			it("should NOT create a lead when honeypot is filled", async () => {
				// Reset the mock to track calls
				mockDb.insert.mockClear();

				const payload = createValidLeadPayload({
					website: "http://spam-bot-filled-this.com",
				});

				await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				// db.insert should NOT have been called
				expect(mockDb.insert).not.toHaveBeenCalled();
			});

			it("should log the spam attempt when honeypot is filled", async () => {
				const payload = createValidLeadPayload({
					email: "bot@spammer.com",
					website: "http://spam.com",
				});

				await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				// Verify console.log was called with spam indicator
				expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[SPAM]"));
				expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("bot@spammer.com"));
			});

			it("should detect honeypot with any non-empty string", async () => {
				mockDb.insert.mockClear();

				const payload = createValidLeadPayload({
					website: "any value",
				});

				await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(mockDb.insert).not.toHaveBeenCalled();
			});

			it("should NOT trigger honeypot when website field is empty string", async () => {
				setupDbMock();

				const payload = createValidLeadPayload({
					website: "",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				expect(mockDb.insert).toHaveBeenCalled();
			});

			it("should NOT trigger honeypot when website field is whitespace only", async () => {
				setupDbMock();

				const payload = createValidLeadPayload({
					website: "   ",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				expect(mockDb.insert).toHaveBeenCalled();
			});

			it("should NOT trigger honeypot when website field is undefined", async () => {
				setupDbMock();

				const payload = createValidLeadPayload();
				// website is not in the payload

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				expect(mockDb.insert).toHaveBeenCalled();
			});

			it("should return same response format for honeypot as legitimate submissions", async () => {
				setupDbMock();

				// First, make a legitimate submission
				const legitPayload = createValidLeadPayload();
				const legitRes = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(legitPayload),
				});
				const legitBody = await legitRes.json();

				// Then, make a spam submission
				mockDb.insert.mockClear();
				const spamPayload = createValidLeadPayload({ website: "spam-value" });
				const spamRes = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(spamPayload),
				});
				const spamBody = await spamRes.json();

				// Both should have identical response format
				expect(legitRes.status).toBe(spamRes.status);
				expect(legitBody).toEqual(spamBody);
			});
		});

		describe("Optional fields", () => {
			it("should accept valid phone numbers in various formats", async () => {
				const phoneFormats = [
					"+1 (555) 123-4567",
					"555-123-4567",
					"(555) 123-4567",
					"+44 20 7946 0958",
					"1234567890",
				];

				for (const phone of phoneFormats) {
					vi.clearAllMocks();
					setupDbMock();

					const payload = createValidLeadPayload({ phone });

					const res = await app.request("/api/leads", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});

					expect(res.status).toBe(201);
				}
			});

			it("should accept company name", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({ company: "Tech Startup Inc." });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.company).toBe("Tech Startup Inc.");
			});

			it("should accept budget selection", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({ budget: "$50,000 - $100,000" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.budget).toBe("$50,000 - $100,000");
			});

			it("should accept project type selection", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({ projectType: "Legacy Modernization" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.projectType).toBe("Legacy Modernization");
			});

			it("should accept custom source", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({ source: "LinkedIn" });

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.source).toBe("LinkedIn");
			});
		});

		describe("Success message format", () => {
			it("should return proper success message structure", async () => {
				setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);
				const body = await res.json();

				// Verify exact response structure
				expect(body).toHaveProperty("success", true);
				expect(body).toHaveProperty("message");
				expect(typeof body.message).toBe("string");
				expect(body.message).toContain("24 hours");
			});

			it("should not include lead ID or sensitive data in response", async () => {
				setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				const body = await res.json();

				// Response should only have success and message
				expect(Object.keys(body)).toHaveLength(2);
				expect(body).not.toHaveProperty("id");
				expect(body).not.toHaveProperty("lead");
				expect(body).not.toHaveProperty("data");
			});
		});

		describe("Edge cases", () => {
			it("should handle Unicode characters in name and message", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					name: "Javier Garcia",
					message: "I need help with building a platform for my business.",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.name).toBe("Javier Garcia");
			});

			it("should handle special characters in company name", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					company: "O'Reilly & Associates, Inc.",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.company).toBe("O'Reilly & Associates, Inc.");
			});

			it("should handle email with plus addressing", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					email: "john+crm@example.com",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.email).toBe("john+crm@example.com");
			});

			it("should handle message with line breaks", async () => {
				const { leadValues } = setupDbMock();

				const payload = createValidLeadPayload({
					message: "Hello,\n\nI have a project.\n\nThanks!",
				});

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const insertCallArgs = leadValues.mock.calls[0][0];
				expect(insertCallArgs.message).toContain("\n");
			});

			it("should handle unknown IP when no headers present", async () => {
				const { activityValues } = setupDbMock();

				const res = await app.request("/api/leads", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(createValidLeadPayload()),
				});

				expect(res.status).toBe(201);

				const activityCallArgs = activityValues.mock.calls[0][0];
				expect(activityCallArgs.description).toContain("unknown");
			});
		});
	});
});
