import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/db/migrate.ts", "src/db/seed.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: false, // Don't clean - admin UI is already in dist/admin
  sourcemap: true,
  // Don't bundle node_modules - they'll be installed separately
  external: [
    "hono",
    "@hono/node-server",
    "drizzle-orm",
    "postgres",
    "@node-rs/argon2",
    "openai",
    "resend",
    "zod",
  ],
});
