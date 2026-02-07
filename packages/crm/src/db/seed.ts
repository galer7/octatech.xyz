import { hash } from "@node-rs/argon2";
import { db, closeConnection } from "./connection.js";
import { adminUser, settings } from "./schema.js";
import { eq } from "drizzle-orm";

/**
 * Seed script for initializing the CRM database with required data.
 *
 * Creates:
 * - Initial admin user (from environment variables or defaults)
 * - Default system settings
 *
 * This script is idempotent - it can be run multiple times without
 * creating duplicate records.
 *
 * Required environment variables:
 * - DATABASE_URL: PostgreSQL connection string
 * - ADMIN_EMAIL: Admin user email (default: admin@octatech.xyz)
 * - ADMIN_PASSWORD: Admin user password (required, must be strong)
 *
 * Usage:
 *   npx tsx src/db/seed.ts
 *   npm run db:seed
 */

// Argon2id configuration matching spec (05-authentication.md)
const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Validate password strength according to spec requirements.
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Default system settings to be created on first run.
 */
const DEFAULT_SETTINGS = [
  {
    key: "openai_api_key",
    value: "", // Set via environment or admin UI
    description: "OpenAI API key for AI features (lead parsing)",
  },
  {
    key: "cal_com_link",
    value: "https://cal.com/octatech",
    description: "Cal.com booking link for consultations",
  },
  {
    key: "company_name",
    value: "Octatech",
    description: "Company name displayed in notifications",
  },
  {
    key: "admin_email",
    value: "admin@octatech.xyz",
    description: "Primary admin email for notifications",
  },
  {
    key: "crm_base_url",
    value: "https://api.octatech.xyz",
    description: "Base URL for CRM links in notifications",
  },
] as const;

async function seedAdminUser(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || "admin@octatech.xyz";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error("❌ ADMIN_PASSWORD environment variable is required");
    console.error("   Set a strong password with:");
    console.error("   - At least 12 characters");
    console.error("   - Uppercase and lowercase letters");
    console.error("   - At least one number");
    console.error("   - At least one special character");
    process.exit(1);
  }

  // Validate password strength
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    console.error("❌ Password does not meet strength requirements:");
    validation.errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }

  // Check if admin user already exists
  const existingUser = await db
    .select()
    .from(adminUser)
    .where(eq(adminUser.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    console.log(`✅ Admin user already exists: ${email}`);
    return;
  }

  // Hash password with Argon2id
  console.log("🔐 Hashing admin password...");
  const passwordHash = await hash(password, ARGON2_OPTIONS);

  // Create admin user
  await db.insert(adminUser).values({
    email,
    passwordHash,
  });

  console.log(`✅ Created admin user: ${email}`);
}

async function seedSettings(): Promise<void> {
  console.log("⚙️  Seeding default settings...");

  for (const setting of DEFAULT_SETTINGS) {
    // Check if setting already exists
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, setting.key))
      .limit(1);

    if (existing.length > 0) {
      console.log(`   ⏭️  Setting "${setting.key}" already exists, skipping`);
      continue;
    }

    // Insert default setting
    await db.insert(settings).values({
      key: setting.key,
      value: setting.value,
    });

    console.log(`   ✅ Created setting: ${setting.key}`);
  }

  console.log("✅ Settings seeding complete");
}

async function main(): Promise<void> {
  console.log("🌱 Starting database seed...\n");

  try {
    await seedAdminUser();
    console.log("");
    await seedSettings();

    console.log("\n✅ Database seed completed successfully!");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

// Run the seed script
main();
