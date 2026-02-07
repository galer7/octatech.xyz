import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Database schema tests.
 *
 * These tests verify:
 * 1. Schema creation and table structure
 * 2. Constraints (check constraints, unique, foreign keys)
 * 3. Cascading deletes
 * 4. Index effectiveness
 * 5. Default values
 *
 * Requires TEST_DATABASE_URL or DATABASE_URL environment variable.
 */

// Skip all tests if no database URL is available
const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const shouldSkip = !DATABASE_URL;

describe.skipIf(shouldSkip)("Database Schema", () => {
  let testSql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    testSql = postgres(DATABASE_URL!, { max: 1 });
    db = drizzle(testSql, { schema });

    // Run migrations or push schema
    // In CI, the schema should already be applied via db:push
  });

  afterAll(async () => {
    await testSql.end();
  });

  describe("Leads Table", () => {
    let testLeadId: string;

    beforeEach(async () => {
      // Clean up any existing test data
      await db.delete(schema.leads).where(eq(schema.leads.email, "test@example.com"));
    });

    afterAll(async () => {
      // Final cleanup
      await db.delete(schema.leads).where(eq(schema.leads.email, "test@example.com"));
    });

    it("should create a lead with required fields", async () => {
      const [lead] = await db
        .insert(schema.leads)
        .values({
          name: "Test Lead",
          email: "test@example.com",
          message: "Test message",
        })
        .returning();

      testLeadId = lead.id;

      expect(lead.id).toBeDefined();
      expect(lead.name).toBe("Test Lead");
      expect(lead.email).toBe("test@example.com");
      expect(lead.message).toBe("Test message");
      expect(lead.status).toBe("new"); // Default value
      expect(lead.aiParsed).toBe(false); // Default value
      expect(lead.createdAt).toBeInstanceOf(Date);
      expect(lead.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a lead with all fields", async () => {
      const [lead] = await db
        .insert(schema.leads)
        .values({
          name: "Full Lead",
          email: "test@example.com",
          company: "Test Company",
          phone: "+1-555-1234",
          budget: "$50,000 - $100,000",
          projectType: "New Product / MVP",
          message: "We need help building a SaaS platform",
          source: "Google Search",
          status: "contacted",
          notes: "Initial contact made",
          tags: ["priority", "enterprise"],
          rawInput: "Original text input",
          aiParsed: true,
        })
        .returning();

      testLeadId = lead.id;

      expect(lead.company).toBe("Test Company");
      expect(lead.phone).toBe("+1-555-1234");
      expect(lead.budget).toBe("$50,000 - $100,000");
      expect(lead.projectType).toBe("New Product / MVP");
      expect(lead.source).toBe("Google Search");
      expect(lead.status).toBe("contacted");
      expect(lead.notes).toBe("Initial contact made");
      expect(lead.tags).toEqual(["priority", "enterprise"]);
      expect(lead.rawInput).toBe("Original text input");
      expect(lead.aiParsed).toBe(true);
    });

    it("should enforce valid status constraint", async () => {
      // Create a valid lead first
      const [lead] = await db
        .insert(schema.leads)
        .values({
          name: "Test Lead",
          email: "test@example.com",
          message: "Test",
        })
        .returning();

      // Try to update with invalid status using raw SQL
      await expect(
        testSql`UPDATE leads SET status = 'invalid_status' WHERE id = ${lead.id}`
      ).rejects.toThrow();
    });

    it("should allow all valid status values", async () => {
      for (const status of schema.leadStatusEnum) {
        const [lead] = await db
          .insert(schema.leads)
          .values({
            name: `Lead ${status}`,
            email: "test@example.com",
            message: "Test",
            status,
          })
          .returning();

        expect(lead.status).toBe(status);
        await db.delete(schema.leads).where(eq(schema.leads.id, lead.id));
      }
    });
  });

  describe("Lead Activities Table", () => {
    let testLeadId: string;

    beforeEach(async () => {
      // Create a test lead for activities
      await db.delete(schema.leads).where(eq(schema.leads.email, "activity-test@example.com"));
      const [lead] = await db
        .insert(schema.leads)
        .values({
          name: "Activity Test Lead",
          email: "activity-test@example.com",
          message: "Test for activities",
        })
        .returning();
      testLeadId = lead.id;
    });

    afterAll(async () => {
      await db.delete(schema.leads).where(eq(schema.leads.email, "activity-test@example.com"));
    });

    it("should create an activity for a lead", async () => {
      const [activity] = await db
        .insert(schema.leadActivities)
        .values({
          leadId: testLeadId,
          type: "note",
          description: "Initial contact notes",
        })
        .returning();

      expect(activity.id).toBeDefined();
      expect(activity.leadId).toBe(testLeadId);
      expect(activity.type).toBe("note");
      expect(activity.description).toBe("Initial contact notes");
      expect(activity.createdAt).toBeInstanceOf(Date);
    });

    it("should create a status change activity", async () => {
      const [activity] = await db
        .insert(schema.leadActivities)
        .values({
          leadId: testLeadId,
          type: "status_change",
          description: "Status changed from new to contacted",
          oldStatus: "new",
          newStatus: "contacted",
        })
        .returning();

      expect(activity.type).toBe("status_change");
      expect(activity.oldStatus).toBe("new");
      expect(activity.newStatus).toBe("contacted");
    });

    it("should cascade delete activities when lead is deleted", async () => {
      // Create some activities
      await db.insert(schema.leadActivities).values([
        { leadId: testLeadId, type: "note", description: "Note 1" },
        { leadId: testLeadId, type: "email", description: "Email sent" },
        { leadId: testLeadId, type: "call", description: "Call made" },
      ]);

      // Verify activities exist
      const activitiesBefore = await db
        .select()
        .from(schema.leadActivities)
        .where(eq(schema.leadActivities.leadId, testLeadId));
      expect(activitiesBefore.length).toBe(3);

      // Delete the lead
      await db.delete(schema.leads).where(eq(schema.leads.id, testLeadId));

      // Verify activities were cascade deleted
      const activitiesAfter = await db
        .select()
        .from(schema.leadActivities)
        .where(eq(schema.leadActivities.leadId, testLeadId));
      expect(activitiesAfter.length).toBe(0);
    });

    it("should enforce foreign key constraint", async () => {
      const fakeLeadId = "00000000-0000-0000-0000-000000000000";

      await expect(
        db.insert(schema.leadActivities).values({
          leadId: fakeLeadId,
          type: "note",
          description: "This should fail",
        })
      ).rejects.toThrow();
    });
  });

  describe("API Keys Table", () => {
    const testKeyHash = "test_hash_" + Date.now();

    afterAll(async () => {
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.keyHash, testKeyHash));
    });

    it("should create an API key", async () => {
      const [key] = await db
        .insert(schema.apiKeys)
        .values({
          name: "Test API Key",
          keyHash: testKeyHash,
          keyPrefix: "oct_test...",
          scopes: ["leads:read", "leads:write"],
        })
        .returning();

      expect(key.id).toBeDefined();
      expect(key.name).toBe("Test API Key");
      expect(key.keyHash).toBe(testKeyHash);
      expect(key.keyPrefix).toBe("oct_test...");
      expect(key.scopes).toEqual(["leads:read", "leads:write"]);
      expect(key.lastUsedAt).toBeNull();
      expect(key.revokedAt).toBeNull();
    });

    it("should enforce unique key hash", async () => {
      await expect(
        db.insert(schema.apiKeys).values({
          name: "Duplicate Key",
          keyHash: testKeyHash,
          keyPrefix: "oct_dup...",
          scopes: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("Webhooks Table", () => {
    let testWebhookId: string;

    beforeEach(async () => {
      await db.delete(schema.webhooks).where(eq(schema.webhooks.name, "Test Webhook"));
    });

    afterAll(async () => {
      await db.delete(schema.webhooks).where(eq(schema.webhooks.name, "Test Webhook"));
    });

    it("should create a webhook", async () => {
      const [webhook] = await db
        .insert(schema.webhooks)
        .values({
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: ["lead.created", "lead.status_changed"],
          secret: "webhook_secret_123",
        })
        .returning();

      testWebhookId = webhook.id;

      expect(webhook.id).toBeDefined();
      expect(webhook.name).toBe("Test Webhook");
      expect(webhook.url).toBe("https://example.com/webhook");
      expect(webhook.events).toEqual(["lead.created", "lead.status_changed"]);
      expect(webhook.secret).toBe("webhook_secret_123");
      expect(webhook.enabled).toBe(true);
      expect(webhook.failureCount).toBe(0);
    });

    it("should cascade delete deliveries when webhook is deleted", async () => {
      // Create webhook
      const [webhook] = await db
        .insert(schema.webhooks)
        .values({
          name: "Test Webhook",
          url: "https://example.com/webhook",
          events: ["lead.created"],
        })
        .returning();

      // Create deliveries
      await db.insert(schema.webhookDeliveries).values([
        {
          webhookId: webhook.id,
          event: "lead.created",
          payload: { test: true },
          statusCode: 200,
          durationMs: 150,
        },
        {
          webhookId: webhook.id,
          event: "lead.created",
          payload: { test: true },
          statusCode: 500,
          durationMs: 3000,
        },
      ]);

      // Verify deliveries exist
      const deliveriesBefore = await db
        .select()
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.webhookId, webhook.id));
      expect(deliveriesBefore.length).toBe(2);

      // Delete webhook
      await db.delete(schema.webhooks).where(eq(schema.webhooks.id, webhook.id));

      // Verify deliveries were cascade deleted
      const deliveriesAfter = await db
        .select()
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.webhookId, webhook.id));
      expect(deliveriesAfter.length).toBe(0);
    });
  });

  describe("Notification Channels Table", () => {
    afterAll(async () => {
      await db
        .delete(schema.notificationChannels)
        .where(eq(schema.notificationChannels.name, "Test Discord"));
    });

    it("should create a Discord notification channel", async () => {
      const [channel] = await db
        .insert(schema.notificationChannels)
        .values({
          type: "discord",
          name: "Test Discord",
          config: { webhook_url: "https://discord.com/api/webhooks/test" },
          events: ["lead.created"],
        })
        .returning();

      expect(channel.id).toBeDefined();
      expect(channel.type).toBe("discord");
      expect(channel.name).toBe("Test Discord");
      expect(channel.config).toEqual({
        webhook_url: "https://discord.com/api/webhooks/test",
      });
      expect(channel.events).toEqual(["lead.created"]);
      expect(channel.enabled).toBe(true);
    });

    it("should create a Telegram notification channel", async () => {
      const [channel] = await db
        .insert(schema.notificationChannels)
        .values({
          type: "telegram",
          name: "Test Telegram",
          config: { bot_token: "123:ABC", chat_id: "-100123456" },
          events: ["lead.created", "lead.status_changed"],
        })
        .returning();

      expect(channel.type).toBe("telegram");
      expect(channel.config).toEqual({
        bot_token: "123:ABC",
        chat_id: "-100123456",
      });

      // Cleanup
      await db
        .delete(schema.notificationChannels)
        .where(eq(schema.notificationChannels.id, channel.id));
    });

    it("should create an Email notification channel", async () => {
      const [channel] = await db
        .insert(schema.notificationChannels)
        .values({
          type: "email",
          name: "Test Email",
          config: { to: "admin@example.com", from: "noreply@octatech.xyz" },
          events: ["lead.created"],
        })
        .returning();

      expect(channel.type).toBe("email");
      expect(channel.config).toEqual({
        to: "admin@example.com",
        from: "noreply@octatech.xyz",
      });

      // Cleanup
      await db
        .delete(schema.notificationChannels)
        .where(eq(schema.notificationChannels.id, channel.id));
    });
  });

  describe("Settings Table", () => {
    afterAll(async () => {
      await db.delete(schema.settings).where(eq(schema.settings.key, "test_setting"));
    });

    it("should create a setting", async () => {
      const [setting] = await db
        .insert(schema.settings)
        .values({
          key: "test_setting",
          value: { enabled: true, threshold: 100 },
        })
        .returning();

      expect(setting.key).toBe("test_setting");
      expect(setting.value).toEqual({ enabled: true, threshold: 100 });
      expect(setting.updatedAt).toBeInstanceOf(Date);
    });

    it("should enforce unique key constraint", async () => {
      await expect(
        db.insert(schema.settings).values({
          key: "test_setting",
          value: "duplicate",
        })
      ).rejects.toThrow();
    });

    it("should update a setting", async () => {
      await db
        .update(schema.settings)
        .set({ value: { enabled: false, threshold: 200 } })
        .where(eq(schema.settings.key, "test_setting"));

      const [updated] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, "test_setting"));

      expect(updated.value).toEqual({ enabled: false, threshold: 200 });
    });
  });

  describe("Admin User & Sessions", () => {
    let testUserId: string;
    const testEmail = "test-admin@example.com";

    beforeEach(async () => {
      await db.delete(schema.adminUser).where(eq(schema.adminUser.email, testEmail));
    });

    afterAll(async () => {
      await db.delete(schema.adminUser).where(eq(schema.adminUser.email, testEmail));
    });

    it("should create an admin user", async () => {
      const [user] = await db
        .insert(schema.adminUser)
        .values({
          email: testEmail,
          passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$...",
        })
        .returning();

      testUserId = user.id;

      expect(user.id).toBeDefined();
      expect(user.email).toBe(testEmail);
      expect(user.passwordHash).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.lastLoginAt).toBeNull();
    });

    it("should enforce unique email", async () => {
      await db.insert(schema.adminUser).values({
        email: testEmail,
        passwordHash: "hash1",
      });

      await expect(
        db.insert(schema.adminUser).values({
          email: testEmail,
          passwordHash: "hash2",
        })
      ).rejects.toThrow();
    });

    it("should create a session for a user", async () => {
      const [user] = await db
        .insert(schema.adminUser)
        .values({
          email: testEmail,
          passwordHash: "hash",
        })
        .returning();

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const [session] = await db
        .insert(schema.sessions)
        .values({
          userId: user.id,
          tokenHash: "session_token_hash_" + Date.now(),
          expiresAt,
          userAgent: "Mozilla/5.0 Test",
          ipAddress: "127.0.0.1",
        })
        .returning();

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(user.id);
      expect(session.expiresAt.getTime()).toBe(expiresAt.getTime());
      expect(session.userAgent).toBe("Mozilla/5.0 Test");
      expect(session.ipAddress).toBe("127.0.0.1");
    });

    it("should cascade delete sessions when user is deleted", async () => {
      const [user] = await db
        .insert(schema.adminUser)
        .values({
          email: testEmail,
          passwordHash: "hash",
        })
        .returning();

      // Create sessions
      await db.insert(schema.sessions).values([
        {
          userId: user.id,
          tokenHash: "hash1_" + Date.now(),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          userId: user.id,
          tokenHash: "hash2_" + Date.now(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);

      // Verify sessions exist
      const sessionsBefore = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      expect(sessionsBefore.length).toBe(2);

      // Delete user
      await db.delete(schema.adminUser).where(eq(schema.adminUser.id, user.id));

      // Verify sessions were cascade deleted
      const sessionsAfter = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));
      expect(sessionsAfter.length).toBe(0);
    });
  });

  describe("Indexes", () => {
    it("should have index on leads.status", async () => {
      const result = await testSql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leads' AND indexname = 'idx_leads_status'
      `;
      expect(result.length).toBe(1);
    });

    it("should have index on leads.email", async () => {
      const result = await testSql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leads' AND indexname = 'idx_leads_email'
      `;
      expect(result.length).toBe(1);
    });

    it("should have index on leads.created_at", async () => {
      const result = await testSql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'leads' AND indexname = 'idx_leads_created_at'
      `;
      expect(result.length).toBe(1);
    });

    it("should have index on sessions.token_hash", async () => {
      const result = await testSql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'sessions' AND indexname = 'idx_sessions_token_hash'
      `;
      expect(result.length).toBe(1);
    });

    it("should have index on api_keys.key_hash", async () => {
      const result = await testSql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'api_keys' AND indexname = 'idx_api_keys_key_hash'
      `;
      expect(result.length).toBe(1);
    });
  });

  describe("Relations", () => {
    it("should query lead with activities using relations", async () => {
      // Create lead
      const [lead] = await db
        .insert(schema.leads)
        .values({
          name: "Relations Test",
          email: "relations-test@example.com",
          message: "Testing relations",
        })
        .returning();

      // Create activities
      await db.insert(schema.leadActivities).values([
        { leadId: lead.id, type: "note", description: "Note 1" },
        { leadId: lead.id, type: "call", description: "Call made" },
      ]);

      // Query with relations
      const leadWithActivities = await db.query.leads.findFirst({
        where: eq(schema.leads.id, lead.id),
        with: { activities: true },
      });

      expect(leadWithActivities).toBeDefined();
      expect(leadWithActivities!.activities).toHaveLength(2);
      expect(leadWithActivities!.activities[0].type).toBe("note");

      // Cleanup
      await db.delete(schema.leads).where(eq(schema.leads.id, lead.id));
    });

    it("should query webhook with deliveries using relations", async () => {
      // Create webhook
      const [webhook] = await db
        .insert(schema.webhooks)
        .values({
          name: "Relations Test Webhook",
          url: "https://example.com/test",
          events: ["lead.created"],
        })
        .returning();

      // Create deliveries
      await db.insert(schema.webhookDeliveries).values([
        {
          webhookId: webhook.id,
          event: "lead.created",
          payload: { test: 1 },
          statusCode: 200,
        },
        {
          webhookId: webhook.id,
          event: "lead.created",
          payload: { test: 2 },
          statusCode: 500,
        },
      ]);

      // Query with relations
      const webhookWithDeliveries = await db.query.webhooks.findFirst({
        where: eq(schema.webhooks.id, webhook.id),
        with: { deliveries: true },
      });

      expect(webhookWithDeliveries).toBeDefined();
      expect(webhookWithDeliveries!.deliveries).toHaveLength(2);

      // Cleanup
      await db.delete(schema.webhooks).where(eq(schema.webhooks.id, webhook.id));
    });

    it("should query admin user with sessions using relations", async () => {
      // Create user
      const [user] = await db
        .insert(schema.adminUser)
        .values({
          email: "relations-user@example.com",
          passwordHash: "hash",
        })
        .returning();

      // Create sessions
      await db.insert(schema.sessions).values([
        {
          userId: user.id,
          tokenHash: "rel_hash1_" + Date.now(),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          userId: user.id,
          tokenHash: "rel_hash2_" + Date.now(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]);

      // Query with relations
      const userWithSessions = await db.query.adminUser.findFirst({
        where: eq(schema.adminUser.id, user.id),
        with: { sessions: true },
      });

      expect(userWithSessions).toBeDefined();
      expect(userWithSessions!.sessions).toHaveLength(2);

      // Cleanup
      await db.delete(schema.adminUser).where(eq(schema.adminUser.id, user.id));
    });
  });
});

// Unit tests that don't require database
describe("Schema Types", () => {
  it("should export lead status enum values", () => {
    expect(schema.leadStatusEnum).toEqual([
      "new",
      "contacted",
      "qualified",
      "proposal",
      "won",
      "lost",
    ]);
  });

  it("should export activity type enum values", () => {
    expect(schema.activityTypeEnum).toEqual([
      "note",
      "email",
      "call",
      "meeting",
      "status_change",
    ]);
  });

  it("should export API key scope enum values", () => {
    expect(schema.apiKeyScopeEnum).toEqual([
      "leads:read",
      "leads:write",
      "leads:delete",
      "leads:*",
      "companies:read",
      "companies:write",
      "companies:delete",
      "companies:*",
      "contacts:read",
      "contacts:write",
      "contacts:delete",
      "contacts:*",
    ]);
  });

  it("should export webhook event enum values", () => {
    expect(schema.webhookEventEnum).toEqual([
      "lead.created",
      "lead.updated",
      "lead.status_changed",
      "lead.deleted",
      "lead.activity_added",
    ]);
  });

  it("should export notification channel type enum values", () => {
    expect(schema.notificationChannelTypeEnum).toEqual([
      "discord",
      "telegram",
      "email",
    ]);
  });
});
