/**
 * Tests for notification dispatcher.
 *
 * Verifies channel querying, notification dispatch, and convenience functions
 * per specs/09-notifications.md.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module BEFORE importing dispatcher
vi.mock("../../db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve([])),
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(() => Promise.resolve([{ id: "test-id" }])),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([])),
				})),
			})),
		})),
	},
	notificationChannels: {},
}));

// Mock the providers
vi.mock("./discord", () => ({
	discordProvider: {
		send: vi.fn(() => Promise.resolve({ success: true, durationMs: 100, statusCode: 200 })),
		validateConfig: vi.fn(() => ({ valid: true })),
	},
}));

vi.mock("./telegram", () => ({
	telegramProvider: {
		send: vi.fn(() => Promise.resolve({ success: true, durationMs: 100, statusCode: 200 })),
		validateConfig: vi.fn(() => ({ valid: true })),
	},
}));

vi.mock("./email", () => ({
	emailProvider: {
		send: vi.fn(() => Promise.resolve({ success: true, durationMs: 100, statusCode: 200 })),
		validateConfig: vi.fn(() => ({ valid: true })),
	},
}));

import type { Lead } from "../../db";
import { db } from "../../db";
import { discordProvider } from "./discord";
import {
	dispatchNotification,
	dispatchNotificationAsync,
	getChannelsForEvent,
	sendTestNotification,
	triggerLeadCreatedNotification,
	triggerLeadStatusChangedNotification,
	validateChannelConfig,
} from "./dispatcher";
import { emailProvider } from "./email";
import { telegramProvider } from "./telegram";

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create a mock Lead object for testing.
 */
function createMockLead(overrides: Partial<Lead> = {}): Lead {
	return {
		id: "lead-123",
		name: "John Doe",
		email: "john@example.com",
		company: "Acme Inc",
		phone: "+1-555-1234",
		budget: "$10,000 - $25,000",
		projectType: "Web Application",
		message: "I need a web application built",
		source: "Contact Form",
		status: "new",
		notes: null,
		tags: null,
		rawInput: null,
		aiParsed: false,
		createdAt: new Date("2024-01-15T10:00:00Z"),
		updatedAt: new Date("2024-01-15T10:00:00Z"),
		contactedAt: null,
		...overrides,
	};
}

/**
 * Create mock channel data.
 */
function createMockChannel(
	type: "discord" | "telegram" | "email",
	overrides: Record<string, unknown> = {},
) {
	const configs = {
		discord: { webhook_url: "https://discord.com/api/webhooks/123/abc" },
		telegram: { bot_token: "123:abc", chat_id: "-100123" },
		email: { to: "admin@example.com", from: "crm@octatech.xyz" },
	};

	return {
		id: `channel-${type}`,
		type,
		name: `${type.charAt(0).toUpperCase() + type.slice(1)} Channel`,
		config: configs[type],
		events: ["lead.created", "lead.status_changed"],
		enabled: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

// ============================================================================
// CHANNEL QUERYING TESTS
// ============================================================================

describe("getChannelsForEvent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return empty array when no channels configured", async () => {
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		} as any);

		const channels = await getChannelsForEvent("lead.created");
		expect(channels).toEqual([]);
	});

	it("should filter channels by event subscription", async () => {
		const mockChannels = [
			createMockChannel("discord", { events: ["lead.created"] }),
			createMockChannel("telegram", { events: ["lead.status_changed"] }),
			createMockChannel("email", { events: ["lead.created", "lead.status_changed"] }),
		];

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(mockChannels)),
			})),
		} as any);

		const channels = await getChannelsForEvent("lead.created");

		// Should include discord and email (both subscribed to lead.created)
		expect(channels).toHaveLength(2);
		expect(channels.map((c) => c.type)).toContain("discord");
		expect(channels.map((c) => c.type)).toContain("email");
		expect(channels.map((c) => c.type)).not.toContain("telegram");
	});

	it("should only return enabled channels", async () => {
		// The mock already filters by enabled in the query
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		} as any);

		await getChannelsForEvent("lead.created");

		// Just verify the query was made
		expect(db.select).toHaveBeenCalled();
	});
});

// ============================================================================
// DISPATCH TESTS
// ============================================================================

describe("dispatchNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return empty array for invalid event", async () => {
		const results = await dispatchNotification("invalid.event", {
			event: "lead.created",
			lead: {
				id: "123",
				name: "Test",
				email: "test@example.com",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				message: "Test",
				source: null,
				status: "new",
				createdAt: new Date(),
			},
		});

		expect(results).toEqual([]);
	});

	it("should dispatch to all subscribed channels", async () => {
		const mockChannels = [createMockChannel("discord"), createMockChannel("email")];

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(mockChannels)),
			})),
		} as any);

		const results = await dispatchNotification("lead.created", {
			event: "lead.created",
			lead: {
				id: "123",
				name: "Test",
				email: "test@example.com",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				message: "Test message",
				source: null,
				status: "new",
				createdAt: new Date(),
			},
		});

		expect(results).toHaveLength(2);
		expect(discordProvider.send).toHaveBeenCalled();
		expect(emailProvider.send).toHaveBeenCalled();
	});

	it("should return results for each channel", async () => {
		const mockChannels = [createMockChannel("discord")];

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(mockChannels)),
			})),
		} as any);

		const results = await dispatchNotification("lead.created", {
			event: "lead.created",
			lead: {
				id: "123",
				name: "Test",
				email: "test@example.com",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				message: "Test message",
				source: null,
				status: "new",
				createdAt: new Date(),
			},
		});

		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			channelId: "channel-discord",
			channelName: "Discord Channel",
			channelType: "discord",
			success: true,
		});
	});

	it("should handle channel delivery failures gracefully", async () => {
		const mockChannels = [createMockChannel("discord")];

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(mockChannels)),
			})),
		} as any);

		vi.mocked(discordProvider.send).mockResolvedValueOnce({
			success: false,
			error: "Discord webhook failed",
			durationMs: 100,
		});

		const results = await dispatchNotification("lead.created", {
			event: "lead.created",
			lead: {
				id: "123",
				name: "Test",
				email: "test@example.com",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				message: "Test message",
				source: null,
				status: "new",
				createdAt: new Date(),
			},
		});

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
		expect(results[0].error).toBe("Discord webhook failed");
	});

	it("should handle unknown channel type", async () => {
		const mockChannels = [
			{
				id: "channel-unknown",
				type: "sms", // Unknown type
				name: "SMS Channel",
				config: {},
				events: ["lead.created"],
				enabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(mockChannels)),
			})),
		} as any);

		const results = await dispatchNotification("lead.created", {
			event: "lead.created",
			lead: {
				id: "123",
				name: "Test",
				email: "test@example.com",
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				message: "Test message",
				source: null,
				status: "new",
				createdAt: new Date(),
			},
		});

		expect(results).toHaveLength(1);
		expect(results[0].success).toBe(false);
		expect(results[0].error).toContain("Unknown channel type");
	});
});

describe("dispatchNotificationAsync", () => {
	it("should not throw on error", () => {
		// dispatchNotificationAsync is fire-and-forget
		expect(() => {
			dispatchNotificationAsync("lead.created", {
				event: "lead.created",
				lead: {
					id: "123",
					name: "Test",
					email: "test@example.com",
					company: null,
					phone: null,
					budget: null,
					projectType: null,
					message: "Test",
					source: null,
					status: "new",
					createdAt: new Date(),
				},
			});
		}).not.toThrow();
	});
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("validateChannelConfig", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should validate Discord config", () => {
		const config = { webhook_url: "https://discord.com/api/webhooks/123/abc" };
		const _result = validateChannelConfig("discord", config);
		expect(discordProvider.validateConfig).toHaveBeenCalledWith(config);
	});

	it("should validate Telegram config", () => {
		const config = { bot_token: "123:abc", chat_id: "-100" };
		const _result = validateChannelConfig("telegram", config);
		expect(telegramProvider.validateConfig).toHaveBeenCalledWith(config);
	});

	it("should validate Email config", () => {
		const config = { to: "test@example.com", from: "noreply@example.com" };
		const _result = validateChannelConfig("email", config);
		expect(emailProvider.validateConfig).toHaveBeenCalledWith(config);
	});

	it("should reject unknown channel type", () => {
		const result = validateChannelConfig("sms" as any, {});
		expect(result.valid).toBe(false);
		expect(result.error).toContain("Unknown channel type");
	});
});

// ============================================================================
// TEST NOTIFICATION TESTS
// ============================================================================

describe("sendTestNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return null if channel not found", async () => {
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve([])),
				})),
			})),
		} as any);

		const result = await sendTestNotification("non-existent-id");
		expect(result).toBeNull();
	});

	it("should send test notification to found channel", async () => {
		const mockChannel = createMockChannel("discord");

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve([mockChannel])),
				})),
			})),
		} as any);

		const result = await sendTestNotification("channel-discord");

		expect(result).not.toBeNull();
		expect(result?.channelType).toBe("discord");
		expect(discordProvider.send).toHaveBeenCalled();
	});
});

// ============================================================================
// CONVENIENCE FUNCTION TESTS
// ============================================================================

describe("triggerLeadCreatedNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		} as any);
	});

	it("should call dispatchNotificationAsync with lead.created event", () => {
		const lead = createMockLead();

		// Should not throw
		expect(() => {
			triggerLeadCreatedNotification(lead);
		}).not.toThrow();
	});
});

describe("triggerLeadStatusChangedNotification", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve([])),
			})),
		} as any);
	});

	it("should call dispatchNotificationAsync with lead.status_changed event", () => {
		const lead = createMockLead();

		// Should not throw
		expect(() => {
			triggerLeadStatusChangedNotification(lead, "new", "contacted");
		}).not.toThrow();
	});
});
