/**
 * Admin dashboard API routes.
 *
 * Provides efficient aggregated statistics for the admin dashboard UI.
 * This endpoint avoids the need to fetch all leads client-side just to
 * calculate counts by status.
 *
 * All routes require admin session authentication.
 */

import { Hono } from "hono";
import { desc, sql } from "drizzle-orm";
import { db, leads, leadActivities, leadStatusEnum } from "../../db/index.js";
import { requireAuth } from "../../middleware/auth.js";

/**
 * Admin dashboard routes app instance.
 */
export const adminDashboardRoutes = new Hono();

// All routes require admin authentication
adminDashboardRoutes.use("*", requireAuth);

/**
 * Response type for dashboard stats.
 */
export interface DashboardStatsResponse {
  stats: {
    total: number;
    byStatus: Record<string, number>;
  };
  recentLeads: Array<{
    id: string;
    name: string;
    email: string;
    company: string | null;
    status: string;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    leadId: string;
    leadName: string;
    type: string;
    description: string;
    createdAt: string;
  }>;
}

/**
 * GET /api/admin/dashboard/stats
 *
 * Returns aggregated dashboard statistics including:
 * - Total lead count
 * - Lead count by status (efficient SQL aggregation)
 * - 5 most recent leads
 * - 10 most recent activities
 *
 * This is more efficient than fetching all leads client-side
 * and calculating stats in JavaScript.
 *
 * @response 200 - Dashboard stats
 */
adminDashboardRoutes.get("/stats", async (c) => {
  // Execute all queries in parallel for performance
  const [statusCounts, totalCount, recentLeadsList, recentActivitiesList] =
    await Promise.all([
      // Count leads by status using SQL GROUP BY
      db
        .select({
          status: leads.status,
          count: sql<number>`cast(count(*) as integer)`,
        })
        .from(leads)
        .groupBy(leads.status),

      // Get total count
      db
        .select({
          count: sql<number>`cast(count(*) as integer)`,
        })
        .from(leads),

      // Get 5 most recent leads
      db
        .select({
          id: leads.id,
          name: leads.name,
          email: leads.email,
          company: leads.company,
          status: leads.status,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .orderBy(desc(leads.createdAt))
        .limit(5),

      // Get 10 most recent activities with lead names
      db
        .select({
          id: leadActivities.id,
          leadId: leadActivities.leadId,
          leadName: leads.name,
          type: leadActivities.type,
          description: leadActivities.description,
          createdAt: leadActivities.createdAt,
        })
        .from(leadActivities)
        .innerJoin(leads, sql`${leadActivities.leadId} = ${leads.id}`)
        .orderBy(desc(leadActivities.createdAt))
        .limit(10),
    ]);

  // Build the byStatus object with all statuses initialized to 0
  const byStatus: Record<string, number> = {};
  for (const status of leadStatusEnum) {
    byStatus[status] = 0;
  }

  // Populate with actual counts from the query
  for (const row of statusCounts) {
    if (row.status in byStatus) {
      byStatus[row.status] = row.count;
    }
  }

  // Format recent leads
  const recentLeads = recentLeadsList.map((lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    status: lead.status,
    createdAt: lead.createdAt.toISOString(),
  }));

  // Format recent activities
  const recentActivity = recentActivitiesList.map((activity) => ({
    id: activity.id,
    leadId: activity.leadId,
    leadName: activity.leadName,
    type: activity.type,
    description: activity.description,
    createdAt: activity.createdAt.toISOString(),
  }));

  const response: DashboardStatsResponse = {
    stats: {
      total: totalCount[0]?.count ?? 0,
      byStatus,
    },
    recentLeads,
    recentActivity,
  };

  return c.json(response);
});
