/**
 * Cal.com Webhook Handler Endpoint.
 *
 * Receives webhook payloads from Cal.com when bookings are created.
 * Automatically creates leads in the CRM or adds activity notes for existing leads.
 *
 * Per specs/10-booking.md, this endpoint:
 * - Receives BOOKING_CREATED webhook events from Cal.com
 * - Checks if a lead with the attendee's email already exists
 * - Creates a new lead with source "Cal.com Booking" if no lead exists
 * - Adds a meeting activity note if the lead already exists
 *
 * This endpoint does NOT require authentication - Cal.com calls it directly.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { leads, leadActivities } from "../../db/schema.js";
import { formatZodErrors } from "../../lib/validation.js";
import { triggerLeadCreated } from "../../lib/webhooks.js";

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema for Cal.com attendee information.
 */
const calAttendeeSchema = z.object({
  email: z.string().email("Invalid attendee email"),
  name: z.string().min(1, "Attendee name is required"),
  timeZone: z.string().optional(),
});

/**
 * Schema for Cal.com custom responses (optional fields from booking form).
 */
const calResponsesSchema = z
  .object({
    company: z.string().optional(),
    projectDescription: z.string().optional(),
  })
  .passthrough()
  .optional();

/**
 * Schema for Cal.com booking payload.
 */
const calBookingPayloadSchema = z.object({
  title: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  attendees: z
    .array(calAttendeeSchema)
    .min(1, "At least one attendee is required"),
  responses: calResponsesSchema,
});

/**
 * Schema for the full Cal.com webhook payload.
 * Validates the structure expected from Cal.com webhooks.
 */
const calWebhookSchema = z.object({
  triggerEvent: z.string(),
  payload: calBookingPayloadSchema,
});

export type CalWebhookPayload = z.infer<typeof calWebhookSchema>;

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Cal.com webhook routes app instance.
 */
export const calWebhookRoutes = new Hono();

/**
 * POST /api/webhooks/cal
 *
 * Handle Cal.com webhook events.
 * Currently supports BOOKING_CREATED events.
 *
 * When a booking is created:
 * - If no lead exists with the attendee's email: Creates a new lead
 * - If a lead already exists: Adds a meeting activity noting the booking
 *
 * @returns {Object} Response indicating success or failure
 *
 * @example Request body:
 * ```json
 * {
 *   "triggerEvent": "BOOKING_CREATED",
 *   "payload": {
 *     "title": "Discovery Call",
 *     "startTime": "2025-01-20T10:00:00Z",
 *     "attendees": [{ "email": "john@acme.com", "name": "John Doe" }],
 *     "responses": { "company": "Acme Inc", "projectDescription": "Need help..." }
 *   }
 * }
 * ```
 */
calWebhookRoutes.post("/", async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = calWebhookSchema.safeParse(body);

  if (!parseResult.success) {
    const errors = formatZodErrors(parseResult.error);
    console.error("[Cal.com Webhook] Validation failed:", errors);
    return c.json(
      {
        success: false,
        errors,
      },
      400
    );
  }

  const webhookData = parseResult.data;

  // Only handle BOOKING_CREATED events
  if (webhookData.triggerEvent !== "BOOKING_CREATED") {
    console.log(
      `[Cal.com Webhook] Ignoring event: ${webhookData.triggerEvent}`
    );
    return c.json({ success: true, message: "Event ignored" });
  }

  const { payload } = webhookData;
  const attendee = payload.attendees[0];
  const bookingTitle = payload.title || "Cal.com Booking";
  const bookingTime = payload.startTime
    ? new Date(payload.startTime).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unknown time";

  try {
    // Check if lead with this email already exists
    const [existingLead] = await db
      .select()
      .from(leads)
      .where(eq(leads.email, attendee.email))
      .limit(1);

    if (existingLead) {
      // Lead exists - add activity noting the booking
      console.log(
        `[Cal.com Webhook] Lead exists for ${attendee.email}, adding booking activity`
      );

      await db.insert(leadActivities).values({
        leadId: existingLead.id,
        type: "meeting",
        description: `Cal.com booking created: "${bookingTitle}" scheduled for ${bookingTime}`,
      });

      return c.json({
        success: true,
        message: "Activity added to existing lead",
        leadId: existingLead.id,
      });
    }

    // No existing lead - create a new one
    console.log(
      `[Cal.com Webhook] Creating new lead for ${attendee.email}`
    );

    // Build message from available information
    const messageParts: string[] = [];
    if (payload.responses?.projectDescription) {
      messageParts.push(payload.responses.projectDescription);
    }
    messageParts.push(`Booked via Cal.com: "${bookingTitle}" at ${bookingTime}`);

    const [newLead] = await db
      .insert(leads)
      .values({
        name: attendee.name,
        email: attendee.email,
        company: payload.responses?.company || null,
        phone: null,
        budget: null,
        projectType: null,
        message: messageParts.join("\n\n"),
        source: "Cal.com Booking",
        status: "new",
      })
      .returning();

    // Create initial activity
    await db.insert(leadActivities).values({
      leadId: newLead.id,
      type: "meeting",
      description: `Lead created from Cal.com booking: "${bookingTitle}" scheduled for ${bookingTime}`,
    });

    // Trigger webhooks (fire-and-forget, don't await)
    triggerLeadCreated(newLead).catch((err) => {
      console.error("[Cal.com Webhook] Failed to trigger lead.created webhook:", err);
    });

    console.log(
      `[Cal.com Webhook] Created new lead ${newLead.id} for ${attendee.email}`
    );

    return c.json(
      {
        success: true,
        message: "Lead created",
        leadId: newLead.id,
      },
      201
    );
  } catch (error) {
    console.error("[Cal.com Webhook] Error processing webhook:", error);
    return c.json(
      {
        success: false,
        error: "Internal server error",
      },
      500
    );
  }
});
