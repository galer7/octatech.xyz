/**
 * Tests for Telegram notification provider.
 *
 * Verifies message formatting, validation, and delivery per specs/09-notifications.md.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	escapeHtml,
	formatLeadCreatedMessage,
	formatLeadStatusChangedMessage,
	formatTelegramMessage,
	sendTelegramNotification,
	TELEGRAM_CONFIG,
	telegramProvider,
	validateTelegramConfig,
} from "./telegram";
import type { NotificationLeadData, NotificationPayload } from "./types";

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create mock notification lead data.
 */
function createMockLeadData(overrides: Partial<NotificationLeadData> = {}): NotificationLeadData {
	return {
		id: "lead-123",
		name: "John Doe",
		email: "john@example.com",
		company: "Acme Inc",
		phone: "+1-555-1234",
		budget: "$10,000 - $25,000",
		projectType: "Web Application",
		message: "I need a web application built for my business",
		source: "Contact Form",
		status: "new",
		createdAt: new Date("2024-01-15T10:00:00Z"),
		...overrides,
	};
}

// ============================================================================
// HTML ESCAPING TESTS
// ============================================================================

describe("escapeHtml", () => {
	it("should escape ampersand", () => {
		expect(escapeHtml("A & B")).toBe("A &amp; B");
	});

	it("should escape less than", () => {
		expect(escapeHtml("A < B")).toBe("A &lt; B");
	});

	it("should escape greater than", () => {
		expect(escapeHtml("A > B")).toBe("A &gt; B");
	});

	it("should escape multiple special characters", () => {
		expect(escapeHtml("<script>alert('XSS')</script>")).toBe(
			"&lt;script&gt;alert('XSS')&lt;/script&gt;",
		);
	});

	it("should leave normal text unchanged", () => {
		expect(escapeHtml("Hello World")).toBe("Hello World");
	});
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("validateTelegramConfig", () => {
	describe("valid configurations", () => {
		it("should accept valid bot token and chat ID", () => {
			const config = {
				bot_token: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
				chat_id: "-1001234567890",
			};
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it("should accept positive chat ID (private chat)", () => {
			const config = {
				bot_token: "123:abc-def_ghi",
				chat_id: "12345",
			};
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(true);
		});

		it("should accept negative chat ID (group chat)", () => {
			const config = {
				bot_token: "999:xyz",
				chat_id: "-100123456",
			};
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(true);
		});
	});

	describe("invalid configurations", () => {
		it("should reject null config", () => {
			const result = validateTelegramConfig(null);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Configuration is required");
		});

		it("should reject undefined config", () => {
			const result = validateTelegramConfig(undefined);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("Configuration is required");
		});

		it("should reject missing bot_token", () => {
			const config = { chat_id: "-100123" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("bot_token is required and must be a string");
		});

		it("should reject non-string bot_token", () => {
			const config = { bot_token: 12345, chat_id: "-100123" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("bot_token is required and must be a string");
		});

		it("should reject invalid bot_token format", () => {
			const config = { bot_token: "invalid-format", chat_id: "-100123" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("Invalid bot_token format");
		});

		it("should reject bot_token without colon separator", () => {
			const config = { bot_token: "123456abc", chat_id: "-100123" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
		});

		it("should reject missing chat_id", () => {
			const config = { bot_token: "123:abc" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("chat_id is required and must be a string");
		});

		it("should reject non-string chat_id", () => {
			const config = { bot_token: "123:abc", chat_id: 12345 };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("chat_id is required and must be a string");
		});

		it("should reject non-numeric chat_id", () => {
			const config = { bot_token: "123:abc", chat_id: "not-a-number" };
			const result = validateTelegramConfig(config);
			expect(result.valid).toBe(false);
			expect(result.error).toContain("Invalid chat_id format");
		});
	});
});

// ============================================================================
// MESSAGE FORMATTING TESTS
// ============================================================================

describe("formatLeadCreatedMessage", () => {
	it("should create HTML message with all lead fields", () => {
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const message = formatLeadCreatedMessage(
			payload as Extract<NotificationPayload, { event: "lead.created" }>,
		);

		expect(message).toContain("<b>🆕 New Lead: John Doe</b>");
		expect(message).toContain("<b>Email:</b> john@example.com");
		expect(message).toContain("<b>Company:</b> Acme Inc");
		expect(message).toContain("<b>Phone:</b> +1-555-1234");
		expect(message).toContain("<b>Budget:</b> $10,000 - $25,000");
		expect(message).toContain("<b>Project:</b> Web Application");
		expect(message).toContain("<b>Source:</b> Contact Form");
		expect(message).toContain("<i>I need a web application built for my business</i>");
		expect(message).toContain("View in CRM →");
	});

	it("should handle lead without optional fields", () => {
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData({
				company: null,
				phone: null,
				budget: null,
				projectType: null,
				source: null,
			}),
		};

		const message = formatLeadCreatedMessage(
			payload as Extract<NotificationPayload, { event: "lead.created" }>,
		);

		expect(message).toContain("<b>Email:</b> john@example.com");
		expect(message).not.toContain("<b>Company:</b>");
		expect(message).not.toContain("<b>Phone:</b>");
		expect(message).not.toContain("<b>Budget:</b>");
		expect(message).not.toContain("<b>Project:</b>");
		expect(message).not.toContain("<b>Source:</b>");
	});

	it("should escape HTML in lead data", () => {
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData({
				name: "Test <script>alert('XSS')</script>",
				company: "Acme & Co",
			}),
		};

		const message = formatLeadCreatedMessage(
			payload as Extract<NotificationPayload, { event: "lead.created" }>,
		);

		expect(message).toContain("Test &lt;script&gt;alert('XSS')&lt;/script&gt;");
		expect(message).toContain("Acme &amp; Co");
		expect(message).not.toContain("<script>");
	});

	it("should truncate long messages", () => {
		const longMessage = "A".repeat(700);
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData({ message: longMessage }),
		};

		const message = formatLeadCreatedMessage(
			payload as Extract<NotificationPayload, { event: "lead.created" }>,
		);

		expect(message).toContain("...");
		expect(message.indexOf("<i>")).toBeLessThan(message.length);
	});
});

describe("formatLeadStatusChangedMessage", () => {
	it("should create message with status change info", () => {
		const payload: NotificationPayload = {
			event: "lead.status_changed",
			lead: createMockLeadData(),
			previousStatus: "new",
			newStatus: "contacted",
		};

		const message = formatLeadStatusChangedMessage(
			payload as Extract<NotificationPayload, { event: "lead.status_changed" }>,
		);

		expect(message).toContain("<b>📊 Status Changed: John Doe</b>");
		expect(message).toContain("<b>Email:</b> john@example.com");
		expect(message).toContain("<b>Status:</b> new → contacted");
		expect(message).toContain("View in CRM →");
	});

	it("should include company if present", () => {
		const payload: NotificationPayload = {
			event: "lead.status_changed",
			lead: createMockLeadData(),
			previousStatus: "contacted",
			newStatus: "qualified",
		};

		const message = formatLeadStatusChangedMessage(
			payload as Extract<NotificationPayload, { event: "lead.status_changed" }>,
		);

		expect(message).toContain("<b>Company:</b> Acme Inc");
	});
});

describe("formatTelegramMessage", () => {
	it("should format lead.created event correctly", () => {
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const message = formatTelegramMessage(payload);
		expect(message).toContain("New Lead");
	});

	it("should format lead.status_changed event correctly", () => {
		const payload: NotificationPayload = {
			event: "lead.status_changed",
			lead: createMockLeadData(),
			previousStatus: "new",
			newStatus: "qualified",
		};

		const message = formatTelegramMessage(payload);
		expect(message).toContain("Status Changed");
	});
});

// ============================================================================
// DELIVERY TESTS
// ============================================================================

describe("sendTelegramNotification", () => {
	const mockFetch = vi.fn();
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mockFetch;
		mockFetch.mockReset();
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	it("should succeed with ok response", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: () =>
				Promise.resolve({
					ok: true,
					result: { message_id: 123 },
				}),
		});

		const config = {
			bot_token: "123456789:ABCdef",
			chat_id: "-1001234567890",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(true);
		expect(result.statusCode).toBe(200);
		expect(mockFetch).toHaveBeenCalledWith(
			`${TELEGRAM_CONFIG.apiBaseUrl}/bot123456789:ABCdef/sendMessage`,
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);

		// Check the request body
		const callArgs = mockFetch.mock.calls[0][1];
		const body = JSON.parse(callArgs.body);
		expect(body.chat_id).toBe("-1001234567890");
		expect(body.parse_mode).toBe("HTML");
		expect(body.disable_web_page_preview).toBe(true);
	});

	it("should fail with invalid config", async () => {
		const config = { bot_token: "invalid", chat_id: "abc" };
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid bot_token format");
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should handle API error response", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 400,
			json: () =>
				Promise.resolve({
					ok: false,
					description: "Bad Request: chat not found",
				}),
		});

		const config = {
			bot_token: "123:abc",
			chat_id: "-100123",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("chat not found");
	});

	it("should handle rate limiting (429)", async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 429,
			json: () =>
				Promise.resolve({
					ok: false,
					error_code: 429,
					description: "Too Many Requests: retry after 30",
				}),
		});

		const config = {
			bot_token: "123:abc",
			chat_id: "-100123",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("rate limited");
	});

	it("should handle network errors", async () => {
		mockFetch.mockRejectedValue(new Error("Network unavailable"));

		const config = {
			bot_token: "123:abc",
			chat_id: "-100123",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Network error");
	});

	it("should handle timeout", async () => {
		mockFetch.mockImplementation(
			() =>
				new Promise((_, reject) => {
					const error = new Error("Aborted");
					error.name = "AbortError";
					setTimeout(() => reject(error), 50);
				}),
		);

		const config = {
			bot_token: "123:abc",
			chat_id: "-100123",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("timeout");
	});

	it("should handle invalid JSON response", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const config = {
			bot_token: "123:abc",
			chat_id: "-100123",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await sendTelegramNotification(config, payload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid JSON");
	});
});

// ============================================================================
// PROVIDER INTERFACE TESTS
// ============================================================================

describe("telegramProvider", () => {
	it("should implement send method", () => {
		expect(typeof telegramProvider.send).toBe("function");
	});

	it("should implement validateConfig method", () => {
		expect(typeof telegramProvider.validateConfig).toBe("function");
	});

	it("should validate config correctly", () => {
		const validConfig = { bot_token: "123:abc", chat_id: "-100123" };
		expect(telegramProvider.validateConfig(validConfig).valid).toBe(true);

		const invalidConfig = { bot_token: "invalid" };
		expect(telegramProvider.validateConfig(invalidConfig).valid).toBe(false);
	});

	it("should reject non-Telegram config", async () => {
		const discordConfig = {
			webhook_url: "https://discord.com/api/webhooks/123/abc",
		};
		const payload: NotificationPayload = {
			event: "lead.created",
			lead: createMockLeadData(),
		};

		const result = await telegramProvider.send(discordConfig, payload);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid Telegram configuration");
	});
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe("TELEGRAM_CONFIG", () => {
	it("should have timeout configured", () => {
		expect(TELEGRAM_CONFIG.timeoutMs).toBe(10_000);
	});

	it("should have API base URL configured", () => {
		expect(TELEGRAM_CONFIG.apiBaseUrl).toBe("https://api.telegram.org");
	});
});
