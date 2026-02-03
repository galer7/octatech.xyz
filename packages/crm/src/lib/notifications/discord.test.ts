/**
 * Tests for Discord notification provider.
 *
 * Verifies embed formatting, validation, and delivery per specs/09-notifications.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateDiscordConfig,
  formatDiscordPayload,
  formatLeadCreatedEmbed,
  formatLeadStatusChangedEmbed,
  sendDiscordNotification,
  discordProvider,
  DISCORD_CONFIG,
} from "./discord";
import type { NotificationPayload, NotificationLeadData } from "./types";

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Create mock notification lead data.
 */
function createMockLeadData(
  overrides: Partial<NotificationLeadData> = {}
): NotificationLeadData {
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
// VALIDATION TESTS
// ============================================================================

describe("validateDiscordConfig", () => {
  describe("valid configurations", () => {
    it("should accept valid Discord webhook URL", () => {
      const config = {
        webhook_url: "https://discord.com/api/webhooks/1234567890/abcdefghijk",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept webhook URL with dashes in token", () => {
      const config = {
        webhook_url:
          "https://discord.com/api/webhooks/1234567890/abc-def-ghi_jkl",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid configurations", () => {
    it("should reject null config", () => {
      const result = validateDiscordConfig(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Configuration is required");
    });

    it("should reject undefined config", () => {
      const result = validateDiscordConfig(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Configuration is required");
    });

    it("should reject missing webhook_url", () => {
      const config = {};
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook_url is required and must be a string");
    });

    it("should reject non-string webhook_url", () => {
      const config = { webhook_url: 12345 };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook_url is required and must be a string");
    });

    it("should reject HTTP webhook URL (not HTTPS)", () => {
      const config = {
        webhook_url: "http://discord.com/api/webhooks/123/abc",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid Discord webhook URL");
    });

    it("should reject non-Discord URL", () => {
      const config = {
        webhook_url: "https://example.com/webhooks/123/abc",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid Discord webhook URL");
    });

    it("should reject malformed Discord URL", () => {
      const config = {
        webhook_url: "https://discord.com/api/webhooks/notanumber/abc",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
    });

    it("should reject Discord URL without token", () => {
      const config = {
        webhook_url: "https://discord.com/api/webhooks/1234567890",
      };
      const result = validateDiscordConfig(config);
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// PAYLOAD FORMATTING TESTS
// ============================================================================

describe("formatLeadCreatedEmbed", () => {
  it("should create embed with all lead fields", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = formatLeadCreatedEmbed(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(result.content).toBeNull();
    expect(result.embeds).toHaveLength(1);

    const embed = result.embeds[0];
    expect(embed.title).toBe("🆕 New Lead: John Doe");
    expect(embed.description).toBe(
      "I need a web application built for my business"
    );
    expect(embed.color).toBe(DISCORD_CONFIG.embedColor);
    expect(embed.footer.text).toBe("Octatech CRM");
    expect(embed.url).toContain("lead-123");

    // Check fields
    const fieldNames = embed.fields.map((f) => f.name);
    expect(fieldNames).toContain("📧 Email");
    expect(fieldNames).toContain("🏢 Company");
    expect(fieldNames).toContain("📞 Phone");
    expect(fieldNames).toContain("💰 Budget");
    expect(fieldNames).toContain("📋 Project");
    expect(fieldNames).toContain("🔗 Source");
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

    const result = formatLeadCreatedEmbed(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    const fieldNames = result.embeds[0].fields.map((f) => f.name);
    expect(fieldNames).toContain("📧 Email");
    expect(fieldNames).not.toContain("🏢 Company");
    expect(fieldNames).not.toContain("📞 Phone");
    expect(fieldNames).not.toContain("💰 Budget");
    expect(fieldNames).not.toContain("📋 Project");
    expect(fieldNames).not.toContain("🔗 Source");
  });

  it("should truncate long messages", () => {
    const longMessage = "A".repeat(1500);
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData({ message: longMessage }),
    };

    const result = formatLeadCreatedEmbed(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(result.embeds[0].description!.length).toBeLessThanOrEqual(1003);
    expect(result.embeds[0].description).toContain("...");
  });
});

describe("formatLeadStatusChangedEmbed", () => {
  it("should create embed with status change info", () => {
    const payload: NotificationPayload = {
      event: "lead.status_changed",
      lead: createMockLeadData(),
      previousStatus: "new",
      newStatus: "contacted",
    };

    const result = formatLeadStatusChangedEmbed(
      payload as Extract<NotificationPayload, { event: "lead.status_changed" }>
    );

    expect(result.embeds).toHaveLength(1);

    const embed = result.embeds[0];
    expect(embed.title).toBe("📊 Status Changed: John Doe");
    expect(embed.color).toBe(DISCORD_CONFIG.embedColor);

    const statusField = embed.fields.find((f) => f.name === "📊 Status Change");
    expect(statusField).toBeDefined();
    expect(statusField!.value).toBe("new → contacted");
  });
});

describe("formatDiscordPayload", () => {
  it("should format lead.created event correctly", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = formatDiscordPayload(payload);
    expect(result.embeds[0].title).toContain("New Lead");
  });

  it("should format lead.status_changed event correctly", () => {
    const payload: NotificationPayload = {
      event: "lead.status_changed",
      lead: createMockLeadData(),
      previousStatus: "new",
      newStatus: "qualified",
    };

    const result = formatDiscordPayload(payload);
    expect(result.embeds[0].title).toContain("Status Changed");
  });
});

// ============================================================================
// DELIVERY TESTS
// ============================================================================

describe("sendDiscordNotification", () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("should succeed with 200 response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    });

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockFetch).toHaveBeenCalledWith(
      config.webhook_url,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("should succeed with 204 No Content response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    });

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(204);
  });

  it("should fail with invalid config", async () => {
    const config = { webhook_url: "invalid" };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid Discord webhook URL");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should handle rate limiting (429)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (name: string) => (name === "Retry-After" ? "60" : null),
      },
      text: () => Promise.resolve("Rate limited"),
    });

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.error).toContain("rate limited");
  });

  it("should handle server errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toContain("500");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Network unavailable"));

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

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
        })
    );

    const config = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendDiscordNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });
});

// ============================================================================
// PROVIDER INTERFACE TESTS
// ============================================================================

describe("discordProvider", () => {
  it("should implement send method", () => {
    expect(typeof discordProvider.send).toBe("function");
  });

  it("should implement validateConfig method", () => {
    expect(typeof discordProvider.validateConfig).toBe("function");
  });

  it("should validate config correctly", () => {
    const validConfig = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    expect(discordProvider.validateConfig(validConfig).valid).toBe(true);

    const invalidConfig = { webhook_url: "invalid" };
    expect(discordProvider.validateConfig(invalidConfig).valid).toBe(false);
  });

  it("should reject non-Discord config", async () => {
    const telegramConfig = { bot_token: "123:abc", chat_id: "-100" };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await discordProvider.send(telegramConfig, payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid Discord configuration");
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe("DISCORD_CONFIG", () => {
  it("should have timeout configured", () => {
    expect(DISCORD_CONFIG.timeoutMs).toBe(10_000);
  });

  it("should have embed color configured (indigo)", () => {
    expect(DISCORD_CONFIG.embedColor).toBe(6513393);
  });
});
