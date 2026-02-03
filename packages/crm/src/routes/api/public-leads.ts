/**
 * Public leads endpoint for contact form submissions.
 *
 * Implements the public endpoint for creating leads from the contact form
 * per specs/02-contact-form.md. Includes honeypot spam protection.
 *
 * This endpoint does NOT require API key authentication - it's meant
 * to be called from the public contact form on the landing page.
 */

import { Hono } from "hono";
import { db } from "../../db/connection";
import { leads, leadActivities } from "../../db/schema";
import {
  publicLeadSchema,
  formatZodErrors,
  isHoneypotFilled,
  type PublicLeadInput,
} from "../../lib/validation";
import { triggerLeadCreated } from "../../lib/webhooks";

/**
 * Public leads routes app instance.
 */
export const publicLeadsRoutes = new Hono();

/**
 * POST /api/leads
 *
 * Create a lead from the public contact form.
 * No authentication required.
 *
 * Includes honeypot spam protection:
 * - If the hidden 'website' field is filled, the submission is silently rejected
 * - Returns 200 OK with success message (to not tip off bots)
 * - The lead is NOT actually created
 */
publicLeadsRoutes.post("/", async (c) => {
  // Parse and validate request body
  const body = await c.req.json().catch(() => ({}));
  const parseResult = publicLeadSchema.safeParse(body);

  if (!parseResult.success) {
    // Return validation errors
    const errors = formatZodErrors(parseResult.error);
    return c.json(
      {
        success: false,
        errors,
      },
      400
    );
  }

  const input: PublicLeadInput = parseResult.data;

  // Check honeypot - if filled, silently reject but return success
  // This tricks bots into thinking their submission succeeded
  if (isHoneypotFilled(input.website)) {
    // Log for monitoring (in production, this could go to a metrics system)
    console.log(
      `[SPAM] Honeypot triggered for submission from: ${input.email}`
    );

    // Return success to not reveal the protection mechanism
    return c.json(
      {
        success: true,
        message: "Thank you! We'll be in touch within 24 hours.",
      },
      201
    );
  }

  // Get client IP for logging
  const clientIp =
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Real-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0].trim() ||
    "unknown";

  // Insert lead
  const [newLead] = await db
    .insert(leads)
    .values({
      name: input.name,
      email: input.email,
      company: input.company || null,
      phone: input.phone || null,
      budget: input.budget || null,
      projectType: input.projectType || null,
      message: input.message,
      source: input.source || "Contact Form",
      status: "new",
    })
    .returning();

  // Create initial activity
  await db.insert(leadActivities).values({
    leadId: newLead.id,
    type: "note",
    description: `Lead created via contact form (IP: ${clientIp})`,
  });

  // Trigger webhooks (fire-and-forget, don't await)
  triggerLeadCreated(newLead).catch((err) => {
    console.error("Failed to trigger lead.created webhook:", err);
  });

  // TODO: Trigger notifications (Discord, Telegram, Email) - Phase 8
  // This should notify the admin of the new lead

  // Return success response per spec
  return c.json(
    {
      success: true,
      message: "Thank you! We'll be in touch within 24 hours.",
    },
    201
  );
});
