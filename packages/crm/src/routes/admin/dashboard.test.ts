/**
 * Tests for admin dashboard routes.
 *
 * Verifies the dashboard stats endpoint returns aggregated statistics
 * efficiently using SQL queries rather than loading all leads.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the database module
vi.mock("../../db", () => ({
	db: {
		select: vi.fn(),
	},
	leads: {
		status: "status",
		id: "id",
		name: "name",
		email: "email",
		company: "company",
		createdAt: "created_at",
	},
	leadActivities: {
		id: "id",
		leadId: "lead_id",
		type: "type",
		description: "description",
		createdAt: "created_at",
	},
	leadStatusEnum: ["new", "contacted", "qualified", "proposal", "won", "lost"],
}));

// Mock the auth middleware
vi.mock("../../middleware/auth", () => ({
	requireAuth: vi.fn((_c, next) => next()),
}));

import { db } from "../../db";
import { adminDashboardRoutes } from "./dashboard";

describe("Admin Dashboard Routes", () => {
	let app: Hono;

	beforeEach(() => {
		vi.clearAllMocks();

		app = new Hono();
		app.route("/api/admin/dashboard", adminDashboardRoutes);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("GET /api/admin/dashboard/stats", () => {
		it("should return 200 with dashboard stats", async () => {
			// Mock the database queries
			const mockStatusCounts = [
				{ status: "new", count: 10 },
				{ status: "contacted", count: 5 },
				{ status: "qualified", count: 3 },
				{ status: "proposal", count: 2 },
				{ status: "won", count: 1 },
				{ status: "lost", count: 0 },
			];

			const mockTotalCount = [{ count: 21 }];

			const mockRecentLeads = [
				{
					id: "lead-1",
					name: "John Doe",
					email: "john@example.com",
					company: "Acme Inc",
					status: "new",
					createdAt: new Date("2024-01-15T10:00:00Z"),
				},
				{
					id: "lead-2",
					name: "Jane Smith",
					email: "jane@example.com",
					company: null,
					status: "contacted",
					createdAt: new Date("2024-01-14T10:00:00Z"),
				},
			];

			const mockRecentActivities = [
				{
					id: "activity-1",
					leadId: "lead-1",
					leadName: "John Doe",
					type: "note",
					description: "Initial contact made",
					createdAt: new Date("2024-01-15T11:00:00Z"),
				},
			];

			// Setup mock chain for all queries
			const _mockSelectChain = {
				from: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValueOnce(mockStatusCounts),
				orderBy: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				limit: vi.fn(),
			};

			// First call - status counts (with groupBy)
			// Second call - total count (no groupBy)
			// Third call - recent leads (with orderBy and limit)
			// Fourth call - recent activities (with orderBy and limit)

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// Status counts query
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(mockStatusCounts),
						}),
					};
				} else if (callCount === 2) {
					// Total count query
					return {
						from: vi.fn().mockResolvedValue(mockTotalCount),
					};
				} else if (callCount === 3) {
					// Recent leads query
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(mockRecentLeads),
							}),
						}),
					};
				} else {
					// Recent activities query
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(mockRecentActivities),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");

			expect(res.status).toBe(200);

			const body = await res.json();

			expect(body).toHaveProperty("stats");
			expect(body).toHaveProperty("recentLeads");
			expect(body).toHaveProperty("recentActivity");
		});

		it("should return all status counts initialized to 0 when no leads exist", async () => {
			const mockStatusCounts: unknown[] = [];
			const mockTotalCount = [{ count: 0 }];
			const mockRecentLeads: unknown[] = [];
			const mockRecentActivities: unknown[] = [];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(mockStatusCounts),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue(mockTotalCount),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(mockRecentLeads),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(mockRecentActivities),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");

			expect(res.status).toBe(200);

			const body = await res.json();

			// All statuses should be 0
			expect(body.stats.byStatus).toEqual({
				new: 0,
				contacted: 0,
				qualified: 0,
				proposal: 0,
				won: 0,
				lost: 0,
			});
			expect(body.stats.total).toBe(0);
			expect(body.recentLeads).toEqual([]);
			expect(body.recentActivity).toEqual([]);
		});

		it("should format lead createdAt as ISO string", async () => {
			const testDate = new Date("2024-02-01T15:30:00Z");
			const mockRecentLeads = [
				{
					id: "lead-1",
					name: "Test Lead",
					email: "test@example.com",
					company: "Test Co",
					status: "new",
					createdAt: testDate,
				},
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([]),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 1 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(mockRecentLeads),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			expect(body.recentLeads[0].createdAt).toBe("2024-02-01T15:30:00.000Z");
		});

		it("should format activity createdAt as ISO string", async () => {
			const testDate = new Date("2024-02-01T16:45:00Z");
			const mockRecentActivities = [
				{
					id: "activity-1",
					leadId: "lead-1",
					leadName: "Test Lead",
					type: "note",
					description: "Test note",
					createdAt: testDate,
				},
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([]),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 0 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(mockRecentActivities),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			expect(body.recentActivity[0].createdAt).toBe("2024-02-01T16:45:00.000Z");
		});

		it("should include lead name with activity for display", async () => {
			const mockRecentActivities = [
				{
					id: "activity-1",
					leadId: "lead-1",
					leadName: "John Doe",
					type: "status_change",
					description: "Status changed from new to contacted",
					createdAt: new Date(),
				},
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([]),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 0 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue(mockRecentActivities),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			expect(body.recentActivity[0]).toHaveProperty("leadName", "John Doe");
			expect(body.recentActivity[0]).toHaveProperty("leadId", "lead-1");
		});

		it("should handle partial status counts correctly", async () => {
			// Only some statuses have leads
			const mockStatusCounts = [
				{ status: "new", count: 5 },
				{ status: "won", count: 2 },
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(mockStatusCounts),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 7 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			// Should have counts for existing statuses and 0 for others
			expect(body.stats.byStatus.new).toBe(5);
			expect(body.stats.byStatus.won).toBe(2);
			expect(body.stats.byStatus.contacted).toBe(0);
			expect(body.stats.byStatus.qualified).toBe(0);
			expect(body.stats.byStatus.proposal).toBe(0);
			expect(body.stats.byStatus.lost).toBe(0);
		});

		it("should handle null company in recent leads", async () => {
			const mockRecentLeads = [
				{
					id: "lead-1",
					name: "Solo Developer",
					email: "dev@example.com",
					company: null,
					status: "new",
					createdAt: new Date(),
				},
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue([]),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 1 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(mockRecentLeads),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			expect(body.recentLeads[0].company).toBeNull();
		});

		it("should return stats with correct total count", async () => {
			const mockStatusCounts = [
				{ status: "new", count: 100 },
				{ status: "contacted", count: 50 },
				{ status: "qualified", count: 25 },
				{ status: "proposal", count: 10 },
				{ status: "won", count: 8 },
				{ status: "lost", count: 7 },
			];

			let callCount = 0;
			(db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							groupBy: vi.fn().mockResolvedValue(mockStatusCounts),
						}),
					};
				} else if (callCount === 2) {
					return {
						from: vi.fn().mockResolvedValue([{ count: 200 }]),
					};
				} else if (callCount === 3) {
					return {
						from: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				} else {
					return {
						from: vi.fn().mockReturnValue({
							innerJoin: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}
			});

			const res = await app.request("/api/admin/dashboard/stats");
			const body = await res.json();

			expect(body.stats.total).toBe(200);
		});
	});

	describe("Authentication", () => {
		it("should require authentication via requireAuth middleware", async () => {
			// The middleware is already mocked to pass through,
			// but we can verify it was called
			const { requireAuth } = await import("../../middleware/auth");

			await app.request("/api/admin/dashboard/stats");

			expect(requireAuth).toHaveBeenCalled();
		});
	});
});
