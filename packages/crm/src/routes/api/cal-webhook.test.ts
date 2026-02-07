/**
 * Tests for Cal.com webhook handler endpoint.
 *
 * Verifies webhook payload validation, lead creation/update logic,
 * and activity tracking per specs/10-booking.md.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock db connection BEFORE imports
vi.mock("../../db/connection", () => {
	// Create chainable mocks for drizzle operations
	const mockReturning = vi.fn();
	const mockValues = vi.fn(() => ({ returning: mockReturning }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockSelect = vi.fn(() => ({ from: vi.fn(() => ({ where: mockWhere })) }));

	return {
		db: {
			insert: mockInsert,
			select: mockSelect,
		},
	};
});

// Mock triggerLeadCreated webhook function
vi.mock("../../lib/webhooks", () => ({
	triggerLeadCreated: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "../../db/connection";
import { triggerLeadCreated } from "../../lib/webhooks";
import { errorHandler } from "../../middleware/error-handler";
// Import after mocking
import { calWebhookRoutes } from "./cal-webhook";

// Cast to mock types for type safety
const mockDb = db as unknown as {
	insert: ReturnType<typeof vi.fn>;
	select: ReturnType<typeof vi.fn>;
};

const mockTriggerLeadCreated = triggerLeadCreated as ReturnType<typeof vi.fn>;

/**
 * Helper to create a valid Cal.com webhook payload.
 */
function createValidCalWebhookPayload(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		triggerEvent: "BOOKING_CREATED",
		payload: {
			title: "Discovery Call",
			startTime: "2025-01-20T10:00:00Z",
			endTime: "2025-01-20T10:30:00Z",
			attendees: [
				{
					email: "john@acme.com",
					name: "John Doe",
					timeZone: "America/New_York",
				},
			],
			responses: {
				company: "Acme Inc",
				projectDescription: "We need help building a custom CRM system.",
			},
			...((overrides.payload as Record<string, unknown>) || {}),
		},
		...overrides,
	};
}

/**
 * Helper to setup database mocks for various scenarios.
 */
function setupDbMock(
	options: {
		existingLead?: {
			id: string;
			email: string;
			name: string;
		} | null;
		newLeadId?: string;
		shouldFail?: boolean;
		errorMessage?: string;
	} = {},
) {
	const {
		existingLead = null,
		newLeadId = "new-lead-id-123",
		shouldFail = false,
		errorMessage = "Database error",
	} = options;

	// Track mock calls for verification
	const insertValuesCalls: unknown[] = [];
	const _insertReturningCalls: unknown[] = [];

	// Create separate returning mocks for lead and activity inserts
	const leadReturning = vi.fn();
	const activityReturning = vi.fn();

	if (shouldFail) {
		leadReturning.mockRejectedValue(new Error(errorMessage));
	} else {
		leadReturning.mockResolvedValue([
			{
				id: newLeadId,
				name: "John Doe",
				email: "john@acme.com",
				company: "Acme Inc",
				phone: null,
				budget: null,
				projectType: null,
				message: "Test message",
				source: "Cal.com Booking",
				status: "new",
				createdAt: new Date(),
			},
		]);
		activityReturning.mockResolvedValue([{ id: "activity-id-123" }]);
	}

	// Create separate values mocks
	const leadValues = vi.fn((args) => {
		insertValuesCalls.push(args);
		return { returning: leadReturning };
	});
	const activityValues = vi.fn((args) => {
		insertValuesCalls.push(args);
		return { returning: activityReturning };
	});

	// Mock insert to return different chains based on call order
	let insertCallCount = 0;
	mockDb.insert.mockImplementation(() => {
		insertCallCount++;
		if (existingLead) {
			// For existing lead: only activity insert happens
			return { values: activityValues };
		}
		// For new lead: first insert is lead, second is activity
		if (insertCallCount === 1) {
			return { values: leadValues };
		} else {
			return { values: activityValues };
		}
	});

	// Mock select for finding existing leads
	const mockLimit = vi.fn().mockResolvedValue(existingLead ? [existingLead] : []);
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockFrom = vi.fn(() => ({ where: mockWhere }));
	mockDb.select.mockImplementation(() => ({ from: mockFrom }));

	return {
		mockInsert: mockDb.insert,
		mockSelect: mockDb.select,
		leadValues,
		activityValues,
		leadReturning,
		activityReturning,
		mockWhere,
		mockLimit,
		insertValuesCalls,
	};
}

describe("Cal.com Webhook Routes", () => {
	let app: Hono;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();

		// Create app with routes
		app = new Hono();
		app.route("/api/webhooks/cal", calWebhookRoutes);
		app.onError(errorHandler);

		// Spy on console methods
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	describe("POST /api/webhooks/cal", () => {
		describe("Validation Tests", () => {
			it("should return 400 for empty request body", async () => {
				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({}),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});

			it("should return 400 for missing triggerEvent", async () => {
				const payload = createValidCalWebhookPayload();
				delete payload.triggerEvent;

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
				expect(body.errors.triggerEvent).toBeDefined();
			});

			it("should return 400 for missing payload", async () => {
				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ triggerEvent: "BOOKING_CREATED" }),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
				expect(body.errors.payload).toBeDefined();
			});

			it("should return 400 for missing attendees", async () => {
				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});

			it("should return 400 for empty attendees array", async () => {
				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});

			it("should return 400 for invalid attendee email", async () => {
				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "not-a-valid-email",
								name: "John Doe",
							},
						],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});

			it("should return 400 for missing attendee name", async () => {
				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "john@acme.com",
								name: "",
							},
						],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.errors).toBeDefined();
			});
		});

		describe("Event Handling Tests", () => {
			it("should return 200 and ignore non-BOOKING_CREATED events", async () => {
				const payload = createValidCalWebhookPayload({
					triggerEvent: "BOOKING_CANCELLED",
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(200);
				const body = await res.json();
				expect(body.success).toBe(true);
				expect(body.message).toBe("Event ignored");

				// Verify no database operations occurred
				expect(mockDb.select).not.toHaveBeenCalled();
				expect(mockDb.insert).not.toHaveBeenCalled();
			});

			it("should handle BOOKING_CREATED event successfully", async () => {
				setupDbMock({ existingLead: null, newLeadId: "new-lead-123" });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body.success).toBe(true);
				expect(body.message).toBe("Lead created");
			});
		});

		describe("Lead Creation Tests", () => {
			it("should create a new lead when email doesn't exist", async () => {
				const { leadValues } = setupDbMock({ existingLead: null, newLeadId: "new-lead-456" });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body.success).toBe(true);
				expect(body.leadId).toBe("new-lead-456");

				// Verify lead was inserted with correct data
				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.email).toBe("john@acme.com");
				expect(insertArgs.name).toBe("John Doe");
			});

			it("should include company from responses when provided", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.company).toBe("Acme Inc");
			});

			it("should set company to null when not provided in responses", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "jane@example.com",
								name: "Jane Smith",
							},
						],
						responses: {},
					},
				});

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.company).toBeNull();
			});

			it("should include projectDescription in message when provided", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.message).toContain("We need help building a custom CRM system.");
			});

			it('should use "Cal.com Booking" as source', async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.source).toBe("Cal.com Booking");
			});

			it('should set status to "new"', async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(leadValues).toHaveBeenCalledTimes(1);
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.status).toBe("new");
			});

			it("should create initial activity for new lead", async () => {
				const { activityValues } = setupDbMock({
					existingLead: null,
					newLeadId: "lead-with-activity",
				});

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(activityValues).toHaveBeenCalledTimes(1);
				const activityArgs = activityValues.mock.calls[0][0];
				expect(activityArgs.leadId).toBe("lead-with-activity");
				expect(activityArgs.type).toBe("meeting");
				expect(activityArgs.description).toContain("Lead created from Cal.com booking");
			});

			it("should return 201 with leadId for new leads", async () => {
				setupDbMock({ existingLead: null, newLeadId: "created-lead-id" });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);
				const body = await res.json();
				expect(body.success).toBe(true);
				expect(body.leadId).toBe("created-lead-id");
				expect(body.message).toBe("Lead created");
			});

			it("should trigger lead.created webhook for new leads", async () => {
				setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(mockTriggerLeadCreated).toHaveBeenCalledTimes(1);
			});
		});

		describe("Existing Lead Tests", () => {
			it("should add activity to existing lead instead of creating new one", async () => {
				const existingLead = {
					id: "existing-lead-id-789",
					email: "john@acme.com",
					name: "John Doe",
				};
				const { activityValues, leadValues } = setupDbMock({ existingLead });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(200);
				const body = await res.json();
				expect(body.success).toBe(true);
				expect(body.message).toBe("Activity added to existing lead");
				expect(body.leadId).toBe("existing-lead-id-789");

				// Verify activity was created for existing lead
				expect(activityValues).toHaveBeenCalledTimes(1);
				const activityArgs = activityValues.mock.calls[0][0];
				expect(activityArgs.leadId).toBe("existing-lead-id-789");

				// leadValues should not be called for existing lead (lead insert doesn't happen)
				expect(leadValues).not.toHaveBeenCalled();
			});

			it("should return 200 with existing leadId", async () => {
				const existingLead = {
					id: "existing-lead-456",
					email: "john@acme.com",
					name: "John Doe",
				};
				setupDbMock({ existingLead });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(200);
				const body = await res.json();
				expect(body.leadId).toBe("existing-lead-456");
			});

			it('should create activity with type "meeting" for existing lead', async () => {
				const existingLead = {
					id: "existing-lead-meeting",
					email: "john@acme.com",
					name: "John Doe",
				};
				const { activityValues } = setupDbMock({ existingLead });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(activityValues).toHaveBeenCalledTimes(1);
				const activityArgs = activityValues.mock.calls[0][0];
				expect(activityArgs.type).toBe("meeting");
				expect(activityArgs.description).toContain("Cal.com booking created");
			});

			it("should NOT trigger lead.created webhook for existing leads", async () => {
				const existingLead = {
					id: "existing-lead-no-webhook",
					email: "john@acme.com",
					name: "John Doe",
				};
				setupDbMock({ existingLead });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(mockTriggerLeadCreated).not.toHaveBeenCalled();
			});
		});

		describe("Error Handling Tests", () => {
			it("should handle database errors gracefully (return 500)", async () => {
				setupDbMock({ shouldFail: true, errorMessage: "Connection lost" });

				const payload = createValidCalWebhookPayload();

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(500);
				const body = await res.json();
				expect(body.success).toBe(false);
				expect(body.error).toBe("Internal server error");
			});

			it("should log error when database operation fails", async () => {
				setupDbMock({ shouldFail: true, errorMessage: "Database unavailable" });

				const payload = createValidCalWebhookPayload();

				await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(consoleErrorSpy).toHaveBeenCalledWith(
					expect.stringContaining("[Cal.com Webhook]"),
					expect.any(Error),
				);
			});

			it("should handle invalid JSON gracefully", async () => {
				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: "not valid json",
				});

				expect(res.status).toBe(400);
				const body = await res.json();
				expect(body.success).toBe(false);
			});
		});

		describe("Edge Cases", () => {
			it("should handle booking without title", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload({
					payload: {
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "john@acme.com",
								name: "John Doe",
							},
						],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);

				// Should use default "Cal.com Booking" title
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.message).toContain("Cal.com Booking");
			});

			it("should handle booking without startTime", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Quick Call",
						attendees: [
							{
								email: "john@acme.com",
								name: "John Doe",
							},
						],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);

				// Should use "Unknown time"
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.message).toContain("Unknown time");
			});

			it("should handle booking without responses object", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Discovery Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "john@acme.com",
								name: "John Doe",
							},
						],
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);

				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.company).toBeNull();
			});

			it("should handle multiple attendees (use first one)", async () => {
				const { leadValues } = setupDbMock({ existingLead: null });

				const payload = createValidCalWebhookPayload({
					payload: {
						title: "Team Call",
						startTime: "2025-01-20T10:00:00Z",
						attendees: [
							{
								email: "first@acme.com",
								name: "First Person",
							},
							{
								email: "second@acme.com",
								name: "Second Person",
							},
						],
						responses: {},
					},
				});

				const res = await app.request("/api/webhooks/cal", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});

				expect(res.status).toBe(201);

				// Should use first attendee's info
				const insertArgs = leadValues.mock.calls[0][0];
				expect(insertArgs.email).toBe("first@acme.com");
				expect(insertArgs.name).toBe("First Person");
			});

			it("should handle various BOOKING_* event types gracefully", async () => {
				const ignoredEvents = [
					"BOOKING_CANCELLED",
					"BOOKING_RESCHEDULED",
					"BOOKING_CONFIRMED",
					"MEETING_ENDED",
				];

				for (const eventType of ignoredEvents) {
					vi.clearAllMocks();

					const payload = createValidCalWebhookPayload({
						triggerEvent: eventType,
					});

					const res = await app.request("/api/webhooks/cal", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});

					expect(res.status).toBe(200);
					const body = await res.json();
					expect(body.message).toBe("Event ignored");
				}
			});
		});
	});
});
