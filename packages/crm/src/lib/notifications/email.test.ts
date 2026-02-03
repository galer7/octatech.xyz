/**
 * Tests for Email notification provider.
 *
 * Verifies HTML formatting, validation, and Resend API delivery per specs/09-notifications.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateEmailConfig,
  formatEmail,
  formatLeadCreatedEmail,
  formatLeadStatusChangedEmail,
  sendEmailNotification,
  emailProvider,
  getResendApiKey,
  EMAIL_CONFIG,
} from "./email";
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

describe("validateEmailConfig", () => {
  describe("valid configurations", () => {
    it("should accept valid to and from emails", () => {
      const config = {
        to: "admin@example.com",
        from: "crm@octatech.xyz",
      };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept email with display name", () => {
      const config = {
        to: "Admin <admin@example.com>",
        from: "Octatech CRM <crm@octatech.xyz>",
      };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(true);
    });

    it("should accept comma-separated recipients", () => {
      const config = {
        to: "admin@example.com, team@example.com, support@example.com",
        from: "crm@octatech.xyz",
      };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(true);
    });

    it("should accept mixed format recipients", () => {
      const config = {
        to: "Admin <admin@example.com>, team@example.com",
        from: "CRM <crm@octatech.xyz>",
      };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe("invalid configurations", () => {
    it("should reject null config", () => {
      const result = validateEmailConfig(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Configuration is required");
    });

    it("should reject undefined config", () => {
      const result = validateEmailConfig(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Configuration is required");
    });

    it("should reject missing to field", () => {
      const config = { from: "crm@octatech.xyz" };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("to is required and must be a string");
    });

    it("should reject non-string to field", () => {
      const config = { to: 12345, from: "crm@octatech.xyz" };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("to is required and must be a string");
    });

    it("should reject invalid email in to field", () => {
      const config = { to: "not-an-email", from: "crm@octatech.xyz" };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid email address in 'to' field");
    });

    it("should reject if any recipient is invalid", () => {
      const config = {
        to: "valid@example.com, invalid-email, another@test.com",
        from: "crm@octatech.xyz",
      };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid email address in 'to' field");
    });

    it("should reject missing from field", () => {
      const config = { to: "admin@example.com" };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("from is required and must be a string");
    });

    it("should reject non-string from field", () => {
      const config = { to: "admin@example.com", from: 12345 };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("from is required and must be a string");
    });

    it("should reject invalid email in from field", () => {
      const config = { to: "admin@example.com", from: "not-an-email" };
      const result = validateEmailConfig(config);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Invalid email address in 'from' field");
    });
  });
});

// ============================================================================
// EMAIL FORMATTING TESTS
// ============================================================================

describe("formatLeadCreatedEmail", () => {
  it("should create HTML email with all lead fields", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const { subject, html } = formatLeadCreatedEmail(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(subject).toBe("New Lead: John Doe - Acme Inc");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("New Lead Received");
    expect(html).toContain("John Doe");
    expect(html).toContain("john@example.com");
    expect(html).toContain("Acme Inc");
    expect(html).toContain("+1-555-1234");
    expect(html).toContain("$10,000 - $25,000");
    expect(html).toContain("Web Application");
    expect(html).toContain("Contact Form");
    expect(html).toContain("I need a web application built for my business");
    expect(html).toContain("View Lead in CRM");
    expect(html).toContain("octatech.xyz");
  });

  it("should handle lead without company in subject", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData({ company: null }),
    };

    const { subject } = formatLeadCreatedEmail(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(subject).toBe("New Lead: John Doe");
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

    const { html } = formatLeadCreatedEmail(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(html).toContain("John Doe");
    expect(html).toContain("john@example.com");
    expect(html).not.toContain("Acme Inc");
    expect(html).not.toContain("+1-555-1234");
  });

  it("should escape HTML in lead data", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData({
        name: "Test <script>alert('XSS')</script>",
        message: "Hello & goodbye",
      }),
    };

    const { html } = formatLeadCreatedEmail(
      payload as Extract<NotificationPayload, { event: "lead.created" }>
    );

    expect(html).toContain("Test &lt;script&gt;");
    expect(html).toContain("Hello &amp; goodbye");
    expect(html).not.toContain("<script>alert");
  });
});

describe("formatLeadStatusChangedEmail", () => {
  it("should create email with status change info", () => {
    const payload: NotificationPayload = {
      event: "lead.status_changed",
      lead: createMockLeadData(),
      previousStatus: "new",
      newStatus: "contacted",
    };

    const { subject, html } = formatLeadStatusChangedEmail(
      payload as Extract<NotificationPayload, { event: "lead.status_changed" }>
    );

    expect(subject).toBe(
      "Status Changed: John Doe - Acme Inc (new → contacted)"
    );
    expect(html).toContain("Lead Status Changed");
    expect(html).toContain("John Doe");
    expect(html).toContain("new");
    expect(html).toContain("contacted");
    expect(html).toContain("Previous Status");
    expect(html).toContain("New Status");
  });

  it("should handle lead without company in subject", () => {
    const payload: NotificationPayload = {
      event: "lead.status_changed",
      lead: createMockLeadData({ company: null }),
      previousStatus: "contacted",
      newStatus: "qualified",
    };

    const { subject } = formatLeadStatusChangedEmail(
      payload as Extract<NotificationPayload, { event: "lead.status_changed" }>
    );

    expect(subject).toBe("Status Changed: John Doe (contacted → qualified)");
  });
});

describe("formatEmail", () => {
  it("should format lead.created event correctly", () => {
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const { subject } = formatEmail(payload);
    expect(subject).toContain("New Lead");
  });

  it("should format lead.status_changed event correctly", () => {
    const payload: NotificationPayload = {
      event: "lead.status_changed",
      lead: createMockLeadData(),
      previousStatus: "new",
      newStatus: "qualified",
    };

    const { subject } = formatEmail(payload);
    expect(subject).toContain("Status Changed");
  });
});

// ============================================================================
// DELIVERY TESTS
// ============================================================================

describe("getResendApiKey", () => {
  const originalEnv = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it("should return API key from environment", () => {
    process.env.RESEND_API_KEY = "re_test_key_123";
    expect(getResendApiKey()).toBe("re_test_key_123");
  });

  it("should return null if not set", () => {
    delete process.env.RESEND_API_KEY;
    expect(getResendApiKey()).toBeNull();
  });
});

describe("sendEmailNotification", () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;
  const originalEnv = process.env.RESEND_API_KEY;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    process.env.RESEND_API_KEY = "re_test_api_key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.RESEND_API_KEY = originalEnv;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it("should succeed with valid response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "email-id-123" }),
    });

    const config = {
      to: "admin@example.com",
      from: "CRM <crm@octatech.xyz>",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      `${EMAIL_CONFIG.apiBaseUrl}/emails`,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer re_test_api_key",
        },
      })
    );

    // Check the request body
    const callArgs = mockFetch.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.from).toBe("CRM <crm@octatech.xyz>");
    expect(body.to).toEqual(["admin@example.com"]);
    expect(body.subject).toContain("New Lead");
    expect(body.html).toContain("<!DOCTYPE html>");
  });

  it("should handle multiple recipients", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "email-id-123" }),
    });

    const config = {
      to: "admin@example.com, team@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    await sendEmailNotification(config, payload);

    const callArgs = mockFetch.mock.calls[0][1];
    const body = JSON.parse(callArgs.body);
    expect(body.to).toEqual(["admin@example.com", "team@example.com"]);
  });

  it("should fail without API key", async () => {
    delete process.env.RESEND_API_KEY;

    const config = {
      to: "admin@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should fail with invalid config", async () => {
    const config = { to: "invalid", from: "crm@octatech.xyz" };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid email");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should handle API error response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          message: "Invalid email address",
        }),
    });

    const config = {
      to: "admin@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid email address");
  });

  it("should handle rate limiting (429)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ message: "Too many requests" }),
    });

    const config = {
      to: "admin@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(429);
    expect(result.error).toContain("rate limited");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValue(new Error("Network unavailable"));

    const config = {
      to: "admin@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

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
      to: "admin@example.com",
      from: "crm@octatech.xyz",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await sendEmailNotification(config, payload);

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });
});

// ============================================================================
// PROVIDER INTERFACE TESTS
// ============================================================================

describe("emailProvider", () => {
  it("should implement send method", () => {
    expect(typeof emailProvider.send).toBe("function");
  });

  it("should implement validateConfig method", () => {
    expect(typeof emailProvider.validateConfig).toBe("function");
  });

  it("should validate config correctly", () => {
    const validConfig = { to: "admin@example.com", from: "crm@octatech.xyz" };
    expect(emailProvider.validateConfig(validConfig).valid).toBe(true);

    const invalidConfig = { to: "invalid" };
    expect(emailProvider.validateConfig(invalidConfig).valid).toBe(false);
  });

  it("should reject non-Email config", async () => {
    const discordConfig = {
      webhook_url: "https://discord.com/api/webhooks/123/abc",
    };
    const payload: NotificationPayload = {
      event: "lead.created",
      lead: createMockLeadData(),
    };

    const result = await emailProvider.send(discordConfig, payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid Email configuration");
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe("EMAIL_CONFIG", () => {
  it("should have timeout configured", () => {
    expect(EMAIL_CONFIG.timeoutMs).toBe(10_000);
  });

  it("should have API base URL configured", () => {
    expect(EMAIL_CONFIG.apiBaseUrl).toBe("https://api.resend.com");
  });

  it("should have default from configured", () => {
    expect(EMAIL_CONFIG.defaultFrom).toBe("Octatech CRM <crm@octatech.xyz>");
  });
});
