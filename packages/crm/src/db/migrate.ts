/**
 * Programmatic migration runner for production use.
 * Uses drizzle-orm's migrate function instead of drizzle-kit CLI.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required");
    process.exit(1);
  }

  console.log("🔄 Running database migrations...");

  // Create a separate connection for migrations
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log("✅ Migrations completed successfully");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrations();
