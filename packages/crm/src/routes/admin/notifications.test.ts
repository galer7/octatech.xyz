/**
 * Tests for admin notification channel routes.
 *
 * Verifies CRUD operations for notification channels per specs/09-notifications.md.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock session module
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

// Mock the database module BEFORE importing routes
const mockDbChain = {
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
	returning: vi.fn().mockResolvedValue([]),
};

vi.mock("../../db", () => ({
	db: {
		select: vi.fn(() => mockDbChain),
		insert: vi.fn(() => mockDbChain),
		update: vi.fn(() => mockDbChain),
		delete: vi.fn(() => mockDbChain),
	},
	notificationChannels: {
		id: "id",
		type: "type",
		name: "name",
		config: "config",
		events: "events",
		enabled: "enabled",
		createdAt: "createdAt",
		updatedAt: "updatedAt",
	},
	notificationChannelTypeEnum: ["discord", "telegram", "email"],
}));

// Mock notifications lib
const mockSendTestNotification = vi.fn();
const mockValidateChannelConfig = vi.fn();

vi.mock("../../lib/notifications", () => ({
	validateChannelConfig: (...args: unknown[]) => mockValidateChannelConfig(...args),
	sendTestNotification: (...args: unknown[]) => mockSendTestNotification(...args),
	notificationEventEnum: ["lead.created", "lead.status_changed"],
	VALID_NOTIFICATION_EVENTS: new Set(["lead.created", "lead.status_changed"]),
}));

import { db } from "../../db";
import type { SessionData } from "../../lib/session";
import { SESSION_CONFIG, shouldRefreshSession, validateSession } from "../../lib/session";
import { errorHandler } from "../../middleware/error-handler";
import { adminNotificationsRoutes } from "./notifications";

// Cast to mock types
const mockValidateSession = validateSession as ReturnType<typeof vi.fn>;
const mockShouldRefreshSession = shouldRefreshSession as ReturnType<typeof vi.fn>;
const mockDb = db as unknown as {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
};

// ============================================================================
// TEST HELPERS
// ============================================================================

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
 * Helper to setup mock db chain with resolved value.
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

/**
 * Create a mock channel for testing.
 */
function createMockChannel(
	type: "discord" | "telegram" | "email" = "discord",
	overrides: Record<string, unknown> = {},
) {
	const configs = {
		discord: { webhook_url: "https://discord.com/api/webhooks/123/abcdefghijk" },
		telegram: { bot_token: "123456789:ABCdef", chat_id: "-1001234567890" },
		email: { to: "admin@example.com", from: "crm@octatech.xyz" },
	};

	return {
		id: "channel-123",
		type,
		name: `Test ${type} Channel`,
		config: configs[type],
		events: ["lead.created"],
		enabled: true,
		createdAt: new Date("2024-01-15T10:00:00Z"),
		updatedAt: new Date("2024-01-15T10:00:00Z"),
		...overrides,
	};
}

// ============================================================================
// GET /api/admin/notifications TESTS
// ============================================================================

describe("GET /api/admin/notifications", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup authenticated session
		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		// Create app with routes and error handler
		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should return empty list when no channels exist", async () => {
		const chain = setupMockDbChain([]);
		chain.orderBy.mockResolvedValue([]);

		const res = await app.request("/api/admin/notifications", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.channels).toEqual([]);
	});

	it("should return list of channels", async () => {
		const mockChannels = [
			createMockChannel("discord"),
			createMockChannel("telegram", { id: "channel-456" }),
		];

		const chain = setupMockDbChain(mockChannels);
		chain.orderBy.mockResolvedValue(mockChannels);

		const res = await app.request("/api/admin/notifications", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.channels).toHaveLength(2);
		expect(data.channels[0]).toMatchObject({
			id: "channel-123",
			type: "discord",
			enabled: true,
		});
	});

	it("should serialize dates as ISO strings", async () => {
		const mockChannels = [createMockChannel("discord")];

		const chain = setupMockDbChain(mockChannels);
		chain.orderBy.mockResolvedValue(mockChannels);

		const res = await app.request("/api/admin/notifications", {
			headers: authHeaders(),
		});

		const data = await res.json();
		expect(data.channels[0].createdAt).toBe("2024-01-15T10:00:00.000Z");
		expect(data.channels[0].updatedAt).toBe("2024-01-15T10:00:00.000Z");
	});
});

// ============================================================================
// GET /api/admin/notifications/:id TESTS
// ============================================================================

describe("GET /api/admin/notifications/:id", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should return channel by ID", async () => {
		const mockChannel = createMockChannel("discord");

		const chain = setupMockDbChain([mockChannel]);
		chain.limit.mockResolvedValue([mockChannel]);

		const res = await app.request("/api/admin/notifications/channel-123", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.id).toBe("channel-123");
		expect(data.type).toBe("discord");
	});

	it("should return 404 for non-existent channel", async () => {
		const chain = setupMockDbChain([]);
		chain.limit.mockResolvedValue([]);

		const res = await app.request("/api/admin/notifications/non-existent", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(404);
	});
});

// ============================================================================
// POST /api/admin/notifications TESTS
// ============================================================================

describe("POST /api/admin/notifications", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should create Discord channel with valid data", async () => {
		const mockChannel = createMockChannel("discord");

		const chain = setupMockDbChain([mockChannel]);
		chain.returning.mockResolvedValue([mockChannel]);

		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "discord",
				name: "Test Discord Channel",
				config: { webhook_url: "https://discord.com/api/webhooks/123/abcdefghijk" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.type).toBe("discord");
		expect(data.enabled).toBe(true);
	});

	it("should create Telegram channel with valid data", async () => {
		const mockChannel = createMockChannel("telegram");

		const chain = setupMockDbChain([mockChannel]);
		chain.returning.mockResolvedValue([mockChannel]);

		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "telegram",
				name: "Test Telegram Channel",
				config: { bot_token: "123456789:ABCdef", chat_id: "-1001234567890" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.type).toBe("telegram");
	});

	it("should create Email channel with valid data", async () => {
		const mockChannel = createMockChannel("email");

		const chain = setupMockDbChain([mockChannel]);
		chain.returning.mockResolvedValue([mockChannel]);

		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "email",
				name: "Test Email Channel",
				config: { to: "admin@example.com", from: "crm@octatech.xyz" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(201);
		const data = await res.json();
		expect(data.type).toBe("email");
	});

	it("should reject invalid channel type", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "sms",
				name: "Invalid Channel",
				config: {},
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(400);
	});

	it("should reject missing name", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "discord",
				config: { webhook_url: "https://discord.com/api/webhooks/123/abc" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(400);
	});

	it("should reject empty events array", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "discord",
				name: "Test Channel",
				config: { webhook_url: "https://discord.com/api/webhooks/123/abc" },
				events: [],
			}),
		});

		expect(res.status).toBe(400);
	});

	it("should reject invalid events", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "discord",
				name: "Test Channel",
				config: { webhook_url: "https://discord.com/api/webhooks/123/abc" },
				events: ["invalid.event"],
			}),
		});

		expect(res.status).toBe(400);
	});

	it("should reject invalid Discord webhook URL", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "discord",
				name: "Test Channel",
				config: { webhook_url: "https://example.com/webhook" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(400);
	});

	it("should reject invalid Telegram bot token", async () => {
		const res = await app.request("/api/admin/notifications", {
			method: "POST",
			headers: authHeaders(true),
			body: JSON.stringify({
				type: "telegram",
				name: "Test Channel",
				config: { bot_token: "invalid", chat_id: "-100123" },
				events: ["lead.created"],
			}),
		});

		expect(res.status).toBe(400);
	});
});

// ============================================================================
// PATCH /api/admin/notifications/:id TESTS
// ============================================================================

describe("PATCH /api/admin/notifications/:id", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateChannelConfig.mockReturnValue({ valid: true });

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should update channel name", async () => {
		const existingChannel = createMockChannel("discord");
		const updatedChannel = { ...existingChannel, name: "Updated Name" };

		// Setup select chain (for checking if channel exists)
		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([existingChannel]),
		};

		// Setup update chain
		const updateChain = {
			update: vi.fn().mockReturnThis(),
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([updatedChannel]),
		};

		mockDb.select.mockImplementation(() => selectChain);
		mockDb.update.mockImplementation(() => updateChain);

		const res = await app.request("/api/admin/notifications/channel-123", {
			method: "PATCH",
			headers: authHeaders(true),
			body: JSON.stringify({ name: "Updated Name" }),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.name).toBe("Updated Name");
	});

	it("should update channel enabled status", async () => {
		const existingChannel = createMockChannel("discord");
		const updatedChannel = { ...existingChannel, enabled: false };

		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([existingChannel]),
		};

		const updateChain = {
			update: vi.fn().mockReturnThis(),
			set: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([updatedChannel]),
		};

		mockDb.select.mockImplementation(() => selectChain);
		mockDb.update.mockImplementation(() => updateChain);

		const res = await app.request("/api/admin/notifications/channel-123", {
			method: "PATCH",
			headers: authHeaders(true),
			body: JSON.stringify({ enabled: false }),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.enabled).toBe(false);
	});

	it("should reject update without any fields", async () => {
		const res = await app.request("/api/admin/notifications/channel-123", {
			method: "PATCH",
			headers: authHeaders(true),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(400);
	});

	it("should return 404 for non-existent channel", async () => {
		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([]),
		};

		mockDb.select.mockImplementation(() => selectChain);

		const res = await app.request("/api/admin/notifications/non-existent", {
			method: "PATCH",
			headers: authHeaders(true),
			body: JSON.stringify({ name: "Updated" }),
		});

		expect(res.status).toBe(404);
	});

	it("should validate config when updating", async () => {
		const existingChannel = createMockChannel("discord");

		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([existingChannel]),
		};

		mockDb.select.mockImplementation(() => selectChain);

		mockValidateChannelConfig.mockReturnValue({
			valid: false,
			error: "Invalid configuration",
		});

		const res = await app.request("/api/admin/notifications/channel-123", {
			method: "PATCH",
			headers: authHeaders(true),
			body: JSON.stringify({ config: { webhook_url: "invalid" } }),
		});

		expect(res.status).toBe(400);
		expect(mockValidateChannelConfig).toHaveBeenCalled();
	});
});

// ============================================================================
// DELETE /api/admin/notifications/:id TESTS
// ============================================================================

describe("DELETE /api/admin/notifications/:id", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should delete existing channel", async () => {
		const deleteChain = {
			delete: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([{ id: "channel-123" }]),
		};

		mockDb.delete.mockImplementation(() => deleteChain);

		const res = await app.request("/api/admin/notifications/channel-123", {
			method: "DELETE",
			headers: authHeaders(true),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.message).toContain("deleted");
	});

	it("should return 404 for non-existent channel", async () => {
		const deleteChain = {
			delete: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			returning: vi.fn().mockResolvedValue([]),
		};

		mockDb.delete.mockImplementation(() => deleteChain);

		const res = await app.request("/api/admin/notifications/non-existent", {
			method: "DELETE",
			headers: authHeaders(true),
		});

		expect(res.status).toBe(404);
	});
});

// ============================================================================
// POST /api/admin/notifications/:id/test TESTS
// ============================================================================

describe("POST /api/admin/notifications/:id/test", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should return success for successful test", async () => {
		const mockChannel = createMockChannel("discord");

		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([mockChannel]),
		};

		mockDb.select.mockImplementation(() => selectChain);

		mockSendTestNotification.mockResolvedValue({
			success: true,
			durationMs: 150,
			statusCode: 200,
		});

		const res = await app.request("/api/admin/notifications/channel-123/test", {
			method: "POST",
			headers: authHeaders(true),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(true);
		expect(data.message).toContain("successfully");
		expect(mockSendTestNotification).toHaveBeenCalledWith("channel-123");
	});

	it("should return error for failed test", async () => {
		const mockChannel = createMockChannel("discord");

		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([mockChannel]),
		};

		mockDb.select.mockImplementation(() => selectChain);

		mockSendTestNotification.mockResolvedValue({
			success: false,
			error: "Discord webhook returned 404",
			durationMs: 100,
		});

		const res = await app.request("/api/admin/notifications/channel-123/test", {
			method: "POST",
			headers: authHeaders(true),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.success).toBe(false);
		expect(data.message).toContain("failed");
		expect(data.error).toContain("404");
	});

	it("should return 404 for non-existent channel", async () => {
		const selectChain = {
			select: vi.fn().mockReturnThis(),
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue([]),
		};

		mockDb.select.mockImplementation(() => selectChain);

		const res = await app.request("/api/admin/notifications/non-existent/test", {
			method: "POST",
			headers: authHeaders(true),
		});

		expect(res.status).toBe(404);
	});
});

// ============================================================================
// GET /api/admin/notifications/events/list TESTS
// ============================================================================

describe("GET /api/admin/notifications/events/list", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should return list of events with descriptions", async () => {
		const res = await app.request("/api/admin/notifications/events/list", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.events).toBeInstanceOf(Array);
		expect(data.events.length).toBeGreaterThan(0);

		const leadCreated = data.events.find((e: { event: string }) => e.event === "lead.created");
		expect(leadCreated).toBeDefined();
		expect(leadCreated.description).toBeDefined();
		expect(leadCreated.defaultEnabled).toBe(true);
	});
});

// ============================================================================
// GET /api/admin/notifications/types/list TESTS
// ============================================================================

describe("GET /api/admin/notifications/types/list", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		const mockSession = createMockSession();
		mockValidateSession.mockResolvedValue(mockSession);
		mockShouldRefreshSession.mockReturnValue(false);

		app = new Hono();
		app.route("/api/admin/notifications", adminNotificationsRoutes);
		app.onError(errorHandler);
	});

	it("should return list of channel types with config hints", async () => {
		const res = await app.request("/api/admin/notifications/types/list", {
			headers: authHeaders(),
		});

		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.types).toBeInstanceOf(Array);
		expect(data.types.length).toBe(3);

		const discord = data.types.find((t: { type: string }) => t.type === "discord");
		expect(discord).toBeDefined();
		expect(discord.name).toBe("Discord");
		expect(discord.configFields).toBeInstanceOf(Array);
		expect(discord.configFields[0].name).toBe("webhook_url");

		const telegram = data.types.find((t: { type: string }) => t.type === "telegram");
		expect(telegram).toBeDefined();
		expect(telegram.configFields).toHaveLength(2);

		const email = data.types.find((t: { type: string }) => t.type === "email");
		expect(email).toBeDefined();
		expect(email.configFields).toHaveLength(2);
	});
});
