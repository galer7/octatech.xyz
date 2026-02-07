import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * Database connection module for the CRM.
 *
 * Uses postgres.js for PostgreSQL connectivity with Drizzle ORM.
 * The connection pool is optimized for serverless/Railway deployment.
 *
 * Required environment variable:
 * - DATABASE_URL: PostgreSQL connection string
 */

// Validate DATABASE_URL is present
if (!process.env.DATABASE_URL) {
	throw new Error(
		"DATABASE_URL environment variable is required. " +
			"Example: postgresql://user:pass@host:5432/dbname",
	);
}

/**
 * Connection pool configuration optimized for production use.
 *
 * - max: 10 connections to avoid overwhelming the database
 * - idle_timeout: 20 seconds to release idle connections
 * - connect_timeout: 10 seconds to fail fast on connection issues
 */
const connectionConfig = {
	max: parseInt(process.env.DB_POOL_MAX || "10", 10),
	idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || "20", 10),
	connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "10", 10),
};

/**
 * Raw postgres.js client for direct SQL queries when needed.
 * Prefer using the `db` Drizzle instance for type-safe queries.
 */
export const sql = postgres(process.env.DATABASE_URL, connectionConfig);

/**
 * Drizzle ORM instance with full schema.
 * Use this for all database operations to benefit from type safety.
 *
 * @example
 * ```ts
 * import { db } from './db/connection';
 * import { leads } from './db/schema';
 *
 * // Query all leads
 * const allLeads = await db.select().from(leads);
 *
 * // Query with relations
 * const leadWithActivities = await db.query.leads.findFirst({
 *   where: eq(leads.id, leadId),
 *   with: { activities: true }
 * });
 * ```
 */
export const db = drizzle(sql, { schema });

/**
 * Type export for the database instance.
 * Useful for dependency injection in tests.
 */
export type Database = typeof db;

/**
 * Gracefully close the database connection pool.
 * Call this during application shutdown.
 *
 * @example
 * ```ts
 * process.on('SIGTERM', async () => {
 *   await closeConnection();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeConnection(): Promise<void> {
	await sql.end();
}

/**
 * Health check function to verify database connectivity.
 * Returns connection details on success, throws on failure.
 *
 * @example
 * ```ts
 * app.get('/api/v1/health', async (c) => {
 *   const dbHealth = await checkDatabaseHealth();
 *   return c.json({ status: 'ok', database: dbHealth });
 * });
 * ```
 */
export async function checkDatabaseHealth(): Promise<{
	connected: boolean;
	latencyMs: number;
	version: string;
}> {
	const start = Date.now();

	const result = await sql`SELECT version()`;
	const version = result[0]?.version as string;

	return {
		connected: true,
		latencyMs: Date.now() - start,
		version: version.split(" ").slice(0, 2).join(" "),
	};
}
