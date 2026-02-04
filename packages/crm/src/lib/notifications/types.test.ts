/**
 * Tests for notification type definitions and helper functions.
 *
 * Verifies type guards, conversion functions, and URL generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notificationEventEnum,
  VALID_NOTIFICATION_EVENTS,
  leadToNotificationData,
  getCrmBaseUrl,
  getLeadUrl,
  isDiscordConfig,
  isTelegramConfig,
  isEmailConfig,
  type NotificationLeadData,
} from "./types";
import type { Lead } from "../../db";

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

// ============================================================================
// ENUM TESTS
// ============================================================================

describe("notificationEventEnum", () => {
  it("should contain lead.created event", () => {
    expect(notificationEventEnum).toContain("lead.created");
  });

  it("should contain lead.status_changed event", () => {
    expect(notificationEventEnum).toContain("lead.status_changed");
  });

  it("should have exactly 2 event types", () => {
    expect(notificationEventEnum).toHaveLength(2);
  });
});

describe("VALID_NOTIFICATION_EVENTS", () => {
  it("should be a Set containing all events", () => {
    expect(VALID_NOTIFICATION_EVENTS).toBeInstanceOf(Set);
    expect(VALID_NOTIFICATION_EVENTS.has("lead.created")).toBe(true);
    expect(VALID_NOTIFICATION_EVENTS.has("lead.status_changed")).toBe(true);
  });

  it("should not contain invalid events", () => {
    expect(VALID_NOTIFICATION_EVENTS.has("invalid.event")).toBe(false);
    expect(VALID_NOTIFICATION_EVENTS.has("lead.deleted")).toBe(false);
  });
});

// ============================================================================
// LEAD CONVERSION TESTS
// ============================================================================

describe("leadToNotificationData", () => {
  it("should convert lead to notification data with all fields", () => {
    const lead = createMockLead();
    const data = leadToNotificationData(lead);

    expect(data).toEqual({
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
      createdAt: new Date("2024-01-15T10:00:00Z"),
    });
  });

  it("should handle null optional fields", () => {
    const lead = createMockLead({
      company: null,
      phone: null,
      budget: null,
      projectType: null,
      source: null,
    });
    const data = leadToNotificationData(lead);

    expect(data.company).toBeNull();
    expect(data.phone).toBeNull();
    expect(data.budget).toBeNull();
    expect(data.projectType).toBeNull();
    expect(data.source).toBeNull();
  });

  it("should exclude internal fields like notes, tags, rawInput", () => {
    const lead = createMockLead({
      notes: "Internal notes",
      tags: ["important"],
      rawInput: "Some raw input",
    });
    const data = leadToNotificationData(lead) as Record<string, unknown>;

    expect(data).not.toHaveProperty("notes");
    expect(data).not.toHaveProperty("tags");
    expect(data).not.toHaveProperty("rawInput");
    expect(data).not.toHaveProperty("aiParsed");
    expect(data).not.toHaveProperty("updatedAt");
    expect(data).not.toHaveProperty("contactedAt");
  });
});

// ============================================================================
// URL GENERATION TESTS
// ============================================================================

describe("getCrmBaseUrl", () => {
  const originalEnv = process.env.CRM_BASE_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRM_BASE_URL = originalEnv;
    } else {
      delete process.env.CRM_BASE_URL;
    }
  });

  it("should return environment variable if set", () => {
    process.env.CRM_BASE_URL = "https://custom.crm.example.com";
    expect(getCrmBaseUrl()).toBe("https://custom.crm.example.com");
  });

  it("should return default URL if not set", () => {
    delete process.env.CRM_BASE_URL;
    expect(getCrmBaseUrl()).toBe("https://api.octatech.xyz");
  });
});

describe("getLeadUrl", () => {
  const originalEnv = process.env.CRM_BASE_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRM_BASE_URL = originalEnv;
    } else {
      delete process.env.CRM_BASE_URL;
    }
  });

  it("should generate correct lead URL with default base", () => {
    delete process.env.CRM_BASE_URL;
    const url = getLeadUrl("abc-123");
    expect(url).toBe("https://api.octatech.xyz/leads/abc-123");
  });

  it("should use custom base URL from env", () => {
    process.env.CRM_BASE_URL = "https://crm.test.com";
    const url = getLeadUrl("xyz-789");
    expect(url).toBe("https://crm.test.com/leads/xyz-789");
  });
});

// ============================================================================
// TYPE GUARD TESTS
// ============================================================================

describe("isDiscordConfig", () => {
  it("should return true for valid Discord config", () => {
    const config = { webhook_url: "https://discord.com/api/webhooks/123/abc" };
    expect(isDiscordConfig(config)).toBe(true);
  });

  it("should return false for Telegram config", () => {
    const config = { bot_token: "123:abc", chat_id: "-100123" };
    expect(isDiscordConfig(config)).toBe(false);
  });

  it("should return false for Email config", () => {
    const config = { to: "test@example.com", from: "noreply@example.com" };
    expect(isDiscordConfig(config)).toBe(false);
  });
});

describe("isTelegramConfig", () => {
  it("should return true for valid Telegram config", () => {
    const config = { bot_token: "123:abc", chat_id: "-100123" };
    expect(isTelegramConfig(config)).toBe(true);
  });

  it("should return false for Discord config", () => {
    const config = { webhook_url: "https://discord.com/api/webhooks/123/abc" };
    expect(isTelegramConfig(config)).toBe(false);
  });

  it("should return false if missing bot_token", () => {
    const config = { chat_id: "-100123" } as any;
    expect(isTelegramConfig(config)).toBe(false);
  });

  it("should return false if missing chat_id", () => {
    const config = { bot_token: "123:abc" } as any;
    expect(isTelegramConfig(config)).toBe(false);
  });
});

describe("isEmailConfig", () => {
  it("should return true for valid Email config", () => {
    const config = { to: "test@example.com", from: "noreply@example.com" };
    expect(isEmailConfig(config)).toBe(true);
  });

  it("should return false for Discord config", () => {
    const config = { webhook_url: "https://discord.com/api/webhooks/123/abc" };
    expect(isEmailConfig(config)).toBe(false);
  });

  it("should return false if missing to", () => {
    const config = { from: "noreply@example.com" } as any;
    expect(isEmailConfig(config)).toBe(false);
  });

  it("should return false if missing from", () => {
    const config = { to: "test@example.com" } as any;
    expect(isEmailConfig(config)).toBe(false);
  });
});
