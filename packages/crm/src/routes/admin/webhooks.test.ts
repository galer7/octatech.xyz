/**
 * Tests for admin webhook management routes.
 *
 * Verifies CRUD operations for webhooks per specs/08-webhooks.md.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock session/auth modules BEFORE imports
vi.mock("../../lib/session", () => ({
	validateSession: vi.fn(),
	refreshSession: vi.fn(),
	shouldRefreshSession: vi.fn(),
	SESSION_CONFIG: {
		defaultDurationMs: 24 * 60 * 60 * 1000,
		rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000,
		tokenBytes: 32,
		cookieName: "session",
		refreshThresholdMs: 60 * 60 * 1000,
	},
}));

// Mock the database
vi.mock("../../db", () => {
	const mockDb = {
		select: vi.fn(() => mockDb),
		from: vi.fn(() => mockDb),
		where: vi.fn(() => mockDb),
		orderBy: vi.fn(() => mockDb),
		limit: vi.fn(() => mockDb),
		offset: vi.fn(() => mockDb),
		insert: vi.fn(() => mockDb),
		update: vi.fn(() => mockDb),
		delete: vi.fn(() => mockDb),
		set: vi.fn(() => mockDb),
		values: vi.fn(() => mockDb),
		returning: vi.fn(() => Promise.resolve([])),
		then: vi.fn((resolve: (value: unknown[]) => void) => resolve([])),
	};

	return {
		db: mockDb,
		webhooks: {
			id: "id",
			name: "name",
			url: "url",
			events: "events",
			secret: "secret",
			enabled: "enabled",
			lastTriggeredAt: "lastTriggeredAt",
			lastStatusCode: "lastStatusCode",
			failureCount: "failureCount",
			createdAt: "createdAt",
			updatedAt: "updatedAt",
		},
		webhookDeliveries: {
			id: "id",
			webhookId: "webhookId",
			event: "event",
			payload: "payload",
			statusCode: "statusCode",
			responseBody: "responseBody",
			durationMs: "durationMs",
			attemptedAt: "attemptedAt",
		},
		webhookEventEnum: [
			"lead.created",
			"lead.updated",
			"lead.status_changed",
			"lead.deleted",
			"lead.activity_added",
		],
	};
});

import { db } from "../../db";
import type { SessionData } from "../../lib/session";
import { SESSION_CONFIG, shouldRefreshSession, validateSession } from "../../lib/session";
import { errorHandler } from "../../middleware/error-handler";
// Import after mocking
import { adminWebhooksRoutes } from "./webhooks";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
const mockDb = db as unknown as {
	select: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
	orderBy: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	offset: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock session for testing.
 */
function createMockSession(overrides: Partial<SessionData> = {}): SessionData {
	const now = new Date();
	return {
		sessionId: "sess_test_123",
		userId: "user_test_456",
		user: {
			id: "user_test_456",
			email: "admin@example.com",
		},
		expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		createdAt: now,
		...overrides,
	};
}

/**
 * Helper to make authenticated requests.
 */
function authHeaders(csrfRequired = false) {
	const headers: Record<string, string> = {
		Cookie: `${SESSION_CONFIG.cookieName}=valid_session_token`,
	};
	if (csrfRequired) {
		headers["X-Requested-With"] = "XMLHttpRequest";
		headers["Content-Type"] = "application/json";
	}
	return headers;
}

/**
 * Create a mock webhook object.
 */
function createMockWebhook(overrides: Record<string, unknown> = {}) {
	const now = new Date();
	return {
		id: "webhook_test_123",
		name: "Test Webhook",
		url: "https://example.com/webhook",
		events: ["lead.created", "lead.updated"],
		secret: null,
		enabled: true,
		lastTriggeredAt: null,
		lastStatusCode: null,
		failureCount: 0,
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

/**
 * Create a mock webhook delivery object.
 */
function createMockDelivery(overrides: Record<string, unknown> = {}) {
	const now = new Date();
	return {
		id: "delivery_test_123",
		webhookId: "webhook_test_123",
		event: "lead.created",
		payload: { id: "test", event: "lead.created", timestamp: now.toISOString(), data: {} },
		statusCode: 200,
		responseBody: "OK",
		durationMs: 150,
		attemptedAt: now,
		...overrides,
	};
}

/**
 * Helper to setup mock db chain.
 */
function setupMockDbChain(resolvedValue: unknown) {
	const chain = {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis(),
		offset: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		values: vi.fn().mockReturnThis(),
		returning: vi.fn().mockResolvedValue(resolvedValue),
	};

	mockDb.select.mockImplementation(() => chain);
	mockDb.insert.mockImplementation(() => chain);
	mockDb.update.mockImplementation(() => chain);
	mockDb.delete.mockImplementation(() => chain);

	return chain;
}

describe("Admin Webhooks Routes", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup authenticated session by default
		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		// Create app with routes
		app = new Hono();
		app.route("/api/admin/webhooks", adminWebhooksRoutes);
		app.onError(errorHandler);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ==========================================================================
	// GET /api/admin/webhooks - List webhooks
	// ==========================================================================
	describe("GET /api/admin/webhooks", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks");

			expect(res.status).toBe(401);
		});

		it("should return empty array when no webhooks", async () => {
			const chain = setupMockDbChain([]);
			chain.orderBy.mockResolvedValue([]);

			const res = await app.request("/api/admin/webhooks", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.webhooks).toEqual([]);
		});

		it("should return all webhooks with correct fields", async () => {
			const now = new Date();
			const mockWebhooks = [
				createMockWebhook({
					id: "webhook_1",
					name: "Zapier Integration",
					url: "https://hooks.zapier.com/test",
					events: ["lead.created"],
					lastTriggeredAt: now,
					lastStatusCode: 200,
					failureCount: 0,
					createdAt: now,
					updatedAt: now,
				}),
				createMockWebhook({
					id: "webhook_2",
					name: "Slack Webhook",
					url: "https://hooks.slack.com/test",
					events: ["lead.created", "lead.status_changed"],
					enabled: false,
					failureCount: 3,
					createdAt: now,
					updatedAt: now,
				}),
			];

			const chain = setupMockDbChain(mockWebhooks);
			chain.orderBy.mockResolvedValue(mockWebhooks);

			const res = await app.request("/api/admin/webhooks", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.webhooks).toHaveLength(2);
			expect(body.webhooks[0]).toMatchObject({
				id: "webhook_1",
				name: "Zapier Integration",
				url: "https://hooks.zapier.com/test",
				events: ["lead.created"],
				enabled: true,
				lastStatusCode: 200,
				failureCount: 0,
			});
			expect(body.webhooks[1]).toMatchObject({
				id: "webhook_2",
				name: "Slack Webhook",
				enabled: false,
				failureCount: 3,
			});
		});

		it("should format dates as ISO strings", async () => {
			const now = new Date("2025-01-15T10:00:00Z");
			const mockWebhooks = [
				createMockWebhook({
					lastTriggeredAt: now,
					createdAt: now,
					updatedAt: now,
				}),
			];

			const chain = setupMockDbChain(mockWebhooks);
			chain.orderBy.mockResolvedValue(mockWebhooks);

			const res = await app.request("/api/admin/webhooks", {
				headers: authHeaders(),
			});

			const body = await res.json();
			expect(body.webhooks[0].lastTriggeredAt).toBe(now.toISOString());
			expect(body.webhooks[0].createdAt).toBe(now.toISOString());
			expect(body.webhooks[0].updatedAt).toBe(now.toISOString());
		});

		it("should return null for lastTriggeredAt when not set", async () => {
			const mockWebhooks = [createMockWebhook({ lastTriggeredAt: null })];

			const chain = setupMockDbChain(mockWebhooks);
			chain.orderBy.mockResolvedValue(mockWebhooks);

			const res = await app.request("/api/admin/webhooks", {
				headers: authHeaders(),
			});

			const body = await res.json();
			expect(body.webhooks[0].lastTriggeredAt).toBeNull();
		});
	});

	// ==========================================================================
	// GET /api/admin/webhooks/:id - Get single webhook
	// ==========================================================================
	describe("GET /api/admin/webhooks/:id", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks/webhook_123");

			expect(res.status).toBe(401);
		});

		it("should return webhook by ID", async () => {
			const mockWebhook = createMockWebhook({
				id: "webhook_123",
				name: "My Webhook",
				secret: "supersecret1234567890",
			});

			const chain = setupMockDbChain([mockWebhook]);
			chain.limit.mockResolvedValue([mockWebhook]);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toMatchObject({
				id: "webhook_123",
				name: "My Webhook",
				url: "https://example.com/webhook",
				events: ["lead.created", "lead.updated"],
				enabled: true,
			});
		});

		it("should return 404 for non-existent webhook", async () => {
			const chain = setupMockDbChain([]);
			chain.limit.mockResolvedValue([]);

			const res = await app.request("/api/admin/webhooks/nonexistent", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(404);
			const body = await res.json();
			expect(body.error).toContain("not found");
		});
	});

	// ==========================================================================
	// POST /api/admin/webhooks - Create webhook
	// ==========================================================================
	describe("POST /api/admin/webhooks", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Test",
					url: "https://example.com/hook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(401);
		});

		it("should return 401 without CSRF header", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: "Test",
					url: "https://example.com/hook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(401);
		});

		it("should create webhook with valid data", async () => {
			const now = new Date();
			const createdWebhook = createMockWebhook({
				id: "new_webhook_id",
				name: "New Webhook",
				url: "https://example.com/webhook",
				events: ["lead.created", "lead.updated"],
				createdAt: now,
				updatedAt: now,
			});

			const chain = setupMockDbChain([createdWebhook]);
			chain.returning.mockResolvedValue([createdWebhook]);

			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "New Webhook",
					url: "https://example.com/webhook",
					events: ["lead.created", "lead.updated"],
				}),
			});

			expect(res.status).toBe(201);
			const body = await res.json();
			expect(body).toMatchObject({
				id: "new_webhook_id",
				name: "New Webhook",
				url: "https://example.com/webhook",
				events: ["lead.created", "lead.updated"],
				enabled: true,
				failureCount: 0,
			});
		});

		it("should create webhook with optional secret", async () => {
			const createdWebhook = createMockWebhook({
				id: "new_webhook_id",
				secret: "mysupersecretkey1234",
			});

			const chain = setupMockDbChain([createdWebhook]);
			chain.returning.mockResolvedValue([createdWebhook]);

			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Webhook with Secret",
					url: "https://example.com/webhook",
					events: ["lead.created"],
					secret: "mysupersecretkey1234",
				}),
			});

			expect(res.status).toBe(201);
		});

		it("should require HTTPS URL (reject HTTP)", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Insecure Webhook",
					url: "http://example.com/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.url).toContain("HTTPS");
		});

		it("should reject localhost URLs", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Localhost Webhook",
					url: "https://localhost/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.url).toContain("private");
		});

		it("should reject 127.x.x.x URLs", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Loopback Webhook",
					url: "https://127.0.0.1/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("private");
		});

		it("should reject 10.x.x.x URLs", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Private Webhook",
					url: "https://10.0.0.1/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("private");
		});

		it("should reject 192.168.x.x URLs", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Private Webhook",
					url: "https://192.168.1.1/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("private");
		});

		it("should reject 172.16-31.x.x URLs", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Private Webhook",
					url: "https://172.16.0.1/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("private");
		});

		it("should validate events are valid event names", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Invalid Events Webhook",
					url: "https://example.com/webhook",
					events: ["invalid.event", "not.real"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.events).toContain("Invalid event");
		});

		it("should require at least one event", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "No Events Webhook",
					url: "https://example.com/webhook",
					events: [],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.events).toContain("At least one event");
		});

		it("should require secret to be at least 16 characters", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "Short Secret Webhook",
					url: "https://example.com/webhook",
					events: ["lead.created"],
					secret: "short",
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.secret).toContain("16 characters");
		});

		it("should validate name is required", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					url: "https://example.com/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.name).toBeDefined();
		});

		it("should validate URL is required", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "No URL Webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.code).toBe("VALIDATION_ERROR");
			expect(body.details?.url).toBeDefined();
		});

		it("should validate name length", async () => {
			const res = await app.request("/api/admin/webhooks", {
				method: "POST",
				headers: authHeaders(true),
				body: JSON.stringify({
					name: "a".repeat(300),
					url: "https://example.com/webhook",
					events: ["lead.created"],
				}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.name).toBeDefined();
		});
	});

	// ==========================================================================
	// PATCH /api/admin/webhooks/:id - Update webhook
	// ==========================================================================
	describe("PATCH /api/admin/webhooks/:id", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "Updated" }),
			});

			expect(res.status).toBe(401);
		});

		it("should return 401 without CSRF header", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: "Updated" }),
			});

			expect(res.status).toBe(401);
		});

		it("should update individual fields", async () => {
			const existingWebhook = createMockWebhook({ id: "webhook_123" });
			const updatedWebhook = createMockWebhook({
				id: "webhook_123",
				name: "Updated Name",
			});

			// Setup chain for the select (exists check)
			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([existingWebhook]),
			};

			// Setup chain for the update
			const updateChain = {
				update: vi.fn().mockReturnThis(),
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([updatedWebhook]),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.update.mockImplementation(() => updateChain);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ name: "Updated Name" }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.name).toBe("Updated Name");
		});

		it("should reset failure count when re-enabling disabled webhook", async () => {
			const existingWebhook = createMockWebhook({
				id: "webhook_123",
				enabled: false,
				failureCount: 5,
			});
			const updatedWebhook = createMockWebhook({
				id: "webhook_123",
				enabled: true,
				failureCount: 0,
			});

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([existingWebhook]),
			};

			const updateChain = {
				update: vi.fn().mockReturnThis(),
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([updatedWebhook]),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.update.mockImplementation(() => updateChain);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ enabled: true }),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.enabled).toBe(true);
			expect(body.failureCount).toBe(0);
		});

		it("should validate URL if provided", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ url: "http://insecure.com" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("HTTPS");
		});

		it("should validate events if provided", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ events: ["invalid.event"] }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.events).toContain("Invalid event");
		});

		it("should return 404 for non-existent webhook", async () => {
			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([]),
			};

			mockDb.select.mockImplementation(() => selectChain);

			const res = await app.request("/api/admin/webhooks/nonexistent", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ name: "Updated" }),
			});

			expect(res.status).toBe(404);
		});

		it("should return 400 when no fields to update", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.error).toContain("At least one field");
		});

		it("should validate secret if provided", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ secret: "short" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.secret).toContain("16 characters");
		});

		it("should reject private URL on update", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "PATCH",
				headers: authHeaders(true),
				body: JSON.stringify({ url: "https://192.168.1.1/hook" }),
			});

			expect(res.status).toBe(400);
			const body = await res.json();
			expect(body.details?.url).toContain("private");
		});
	});

	// ==========================================================================
	// DELETE /api/admin/webhooks/:id - Delete webhook
	// ==========================================================================
	describe("DELETE /api/admin/webhooks/:id", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "DELETE",
			});

			expect(res.status).toBe(401);
		});

		it("should return 401 without CSRF header", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "DELETE",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(401);
		});

		it("should delete webhook successfully", async () => {
			const deleteChain = {
				delete: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([{ id: "webhook_123" }]),
			};

			mockDb.delete.mockImplementation(() => deleteChain);

			const res = await app.request("/api/admin/webhooks/webhook_123", {
				method: "DELETE",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				success: true,
				message: "Webhook deleted",
			});
		});

		it("should return 404 for non-existent webhook", async () => {
			const deleteChain = {
				delete: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockResolvedValue([]),
			};

			mockDb.delete.mockImplementation(() => deleteChain);

			const res = await app.request("/api/admin/webhooks/nonexistent", {
				method: "DELETE",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(404);
			const body = await res.json();
			expect(body.error).toContain("not found");
		});
	});

	// ==========================================================================
	// POST /api/admin/webhooks/:id/test - Test webhook
	// ==========================================================================
	describe("POST /api/admin/webhooks/:id/test", () => {
		beforeEach(() => {
			// Mock global fetch for test webhook delivery
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					text: vi.fn().mockResolvedValue("OK"),
				}),
			);
		});

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
			});

			expect(res.status).toBe(401);
		});

		it("should return 401 without CSRF header", async () => {
			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: {
					Cookie: `${SESSION_CONFIG.cookieName}=valid_token`,
				},
			});

			expect(res.status).toBe(401);
		});

		it("should return success/failure status", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockWebhook]),
			};

			const insertChain = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue(undefined),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.insert.mockImplementation(() => insertChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(true);
		});

		it("should return status code and response time", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockWebhook]),
			};

			const insertChain = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue(undefined),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.insert.mockImplementation(() => insertChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			const body = await res.json();
			expect(body.statusCode).toBe(200);
			expect(typeof body.responseTime).toBe("number");
			expect(body.responseTime).toBeGreaterThanOrEqual(0);
		});

		it("should log delivery to database", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockWebhook]),
			};

			const insertChain = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue(undefined),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.insert.mockImplementation(() => insertChain);

			await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			expect(mockDb.insert).toHaveBeenCalled();
		});

		it("should return 404 for non-existent webhook", async () => {
			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([]),
			};

			mockDb.select.mockImplementation(() => selectChain);

			const res = await app.request("/api/admin/webhooks/nonexistent/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(404);
		});

		it("should handle failed webhook delivery", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue({
					ok: false,
					status: 500,
					text: vi.fn().mockResolvedValue("Internal Server Error"),
				}),
			);

			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockWebhook]),
			};

			const insertChain = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue(undefined),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.insert.mockImplementation(() => insertChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.statusCode).toBe(500);
		});

		it("should handle network errors gracefully", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([mockWebhook]),
			};

			const insertChain = {
				insert: vi.fn().mockReturnThis(),
				values: vi.fn().mockResolvedValue(undefined),
			};

			mockDb.select.mockImplementation(() => selectChain);
			mockDb.insert.mockImplementation(() => insertChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/test", {
				method: "POST",
				headers: authHeaders(true),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.success).toBe(false);
			expect(body.responseBody).toContain("Network error");
		});
	});

	// ==========================================================================
	// GET /api/admin/webhooks/:id/deliveries - Delivery history
	// ==========================================================================
	describe("GET /api/admin/webhooks/:id/deliveries", () => {
		it("should return 401 when not authenticated", async () => {
			mockValidateSession.mockResolvedValue(null);

			const res = await app.request("/api/admin/webhooks/webhook_123/deliveries");

			expect(res.status).toBe(401);
		});

		it("should return paginated delivery history", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });
			const now = new Date();
			const mockDeliveries = [
				createMockDelivery({
					id: "delivery_1",
					webhookId: "webhook_123",
					statusCode: 200,
					attemptedAt: now,
				}),
				createMockDelivery({
					id: "delivery_2",
					webhookId: "webhook_123",
					statusCode: 500,
					attemptedAt: new Date(now.getTime() - 60000),
				}),
			];

			let selectCallCount = 0;
			const createSelectChain = () => {
				selectCallCount++;
				if (selectCallCount === 1) {
					// First call: check webhook exists
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([mockWebhook]),
					};
				} else if (selectCallCount === 2) {
					// Second call: count
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockResolvedValue([{ count: 2 }]),
					};
				} else {
					// Third call: get deliveries
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						offset: vi.fn().mockResolvedValue(mockDeliveries),
					};
				}
			};

			mockDb.select.mockImplementation(createSelectChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/deliveries", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.deliveries).toHaveLength(2);
			expect(body.pagination).toMatchObject({
				page: 1,
				limit: 20,
				total: 2,
				totalPages: 1,
				hasMore: false,
			});
		});

		it("should respect page and limit parameters", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });
			const mockDeliveries = [createMockDelivery({ id: "delivery_11" })];

			let selectCallCount = 0;
			const createSelectChain = () => {
				selectCallCount++;
				if (selectCallCount === 1) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([mockWebhook]),
					};
				} else if (selectCallCount === 2) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockResolvedValue([{ count: 25 }]),
					};
				} else {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						offset: vi.fn().mockResolvedValue(mockDeliveries),
					};
				}
			};

			mockDb.select.mockImplementation(createSelectChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/deliveries?page=2&limit=10", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.pagination).toMatchObject({
				page: 2,
				limit: 10,
				total: 25,
				totalPages: 3,
				hasMore: true,
			});
		});

		it("should return 404 for non-existent webhook", async () => {
			const selectChain = {
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([]),
			};

			mockDb.select.mockImplementation(() => selectChain);

			const res = await app.request("/api/admin/webhooks/nonexistent/deliveries", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(404);
		});

		it("should format delivery dates as ISO strings", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });
			const attemptedAt = new Date("2025-01-15T10:00:00Z");
			const mockDeliveries = [createMockDelivery({ id: "delivery_1", attemptedAt })];

			let selectCallCount = 0;
			const createSelectChain = () => {
				selectCallCount++;
				if (selectCallCount === 1) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([mockWebhook]),
					};
				} else if (selectCallCount === 2) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockResolvedValue([{ count: 1 }]),
					};
				} else {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						offset: vi.fn().mockResolvedValue(mockDeliveries),
					};
				}
			};

			mockDb.select.mockImplementation(createSelectChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/deliveries", {
				headers: authHeaders(),
			});

			const body = await res.json();
			expect(body.deliveries[0].attemptedAt).toBe(attemptedAt.toISOString());
		});

		it("should cap limit at 100", async () => {
			const mockWebhook = createMockWebhook({ id: "webhook_123" });

			let selectCallCount = 0;
			const createSelectChain = () => {
				selectCallCount++;
				if (selectCallCount === 1) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([mockWebhook]),
					};
				} else if (selectCallCount === 2) {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockResolvedValue([{ count: 500 }]),
					};
				} else {
					return {
						select: vi.fn().mockReturnThis(),
						from: vi.fn().mockReturnThis(),
						where: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockReturnThis(),
						offset: vi.fn().mockResolvedValue([]),
					};
				}
			};

			mockDb.select.mockImplementation(createSelectChain);

			const res = await app.request("/api/admin/webhooks/webhook_123/deliveries?limit=200", {
				headers: authHeaders(),
			});

			const body = await res.json();
			expect(body.pagination.limit).toBe(100);
		});
	});

	// ==========================================================================
	// GET /api/admin/webhooks/events/list - List events
	// ==========================================================================
	describe("GET /api/admin/webhooks/events/list", () => {
		it("should return all valid events with descriptions", async () => {
			const res = await app.request("/api/admin/webhooks/events/list", {
				headers: authHeaders(),
			});

			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.events).toHaveLength(5);

			const eventNames = body.events.map((e: { event: string }) => e.event);
			expect(eventNames).toContain("lead.created");
			expect(eventNames).toContain("lead.updated");
			expect(eventNames).toContain("lead.status_changed");
			expect(eventNames).toContain("lead.deleted");
			expect(eventNames).toContain("lead.activity_added");
		});

		it("should include descriptions for each event", async () => {
			const res = await app.request("/api/admin/webhooks/events/list", {
				headers: authHeaders(),
			});

			const body = await res.json();
			for (const eventInfo of body.events) {
				expect(eventInfo.event).toBeDefined();
				expect(eventInfo.description).toBeDefined();
				expect(typeof eventInfo.description).toBe("string");
				expect(eventInfo.description.length).toBeGreaterThan(0);
			}
		});

		it("should return specific descriptions for known events", async () => {
			const res = await app.request("/api/admin/webhooks/events/list", {
				headers: authHeaders(),
			});

			const body = await res.json();
			const leadCreated = body.events.find((e: { event: string }) => e.event === "lead.created");
			expect(leadCreated.description).toContain("new lead");

			const statusChanged = body.events.find(
				(e: { event: string }) => e.event === "lead.status_changed",
			);
			expect(statusChanged.description).toContain("status");
		});
	});
});
