/**
 * migrate.ts — Transactional migration runner
 *
 * Uses drizzle-orm's programmatic migrate() function, which wraps each
 * migration file in its own database transaction.  If a migration fails,
 * Postgres rolls back every DDL statement in that file automatically, leaving
 * the database in the exact state it was in before the migration started.
 * Combined with the IF NOT EXISTS / exception-handler guards in every SQL
 * file, this means a failed-and-rolled-back migration is always safe to
 * re-run on the next deploy without any manual intervention.
 *
 * Run via: pnpm --filter @workspace/db run migrate
 * Or:      npx tsx lib/db/src/migrate.ts
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const connectionString =
  process.env.SUPABASE_SESSION_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "ERROR: No database connection string found.\n" +
      "       Set SUPABASE_SESSION_URL or DATABASE_URL.",
  );
  process.exit(1);
}

const isLocalDb = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(connectionString);

const pool = new Pool({
  connectionString,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
});

const db = drizzle(pool);

// Resolve the migrations folder relative to this file so the script works
// regardless of the current working directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, "../migrations");

try {
  console.log(`Running migrations from: ${migrationsFolder}`);
  console.log(
    "Each migration is wrapped in a transaction — a failure rolls back the entire migration automatically.",
  );

  await migrate(db, { migrationsFolder });

  console.log("All migrations applied successfully.");
} catch (err) {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  console.error(
    "\nThe failing migration was rolled back automatically by Postgres.",
  );
  console.error(
    "Fix the root cause and redeploy — the migration is safe to re-run.",
  );
  console.error(
    "\nFor detailed recovery steps see: docs/migration-recovery.md",
  );
  process.exit(1);
} finally {
  await pool.end();
}
