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

function buildConnectionString(): string {
  let cs = process.env.SUPABASE_SESSION_URL ?? process.env.DATABASE_URL;

  if (!cs) {
    console.error(
      "ERROR: No database connection string found.\n" +
        "       Set SUPABASE_SESSION_URL or DATABASE_URL.",
    );
    process.exit(1);
  }

  // Always override the password with SUPABASE_DB_PASSWORD when available.
  // The stored URL may have a stale or missing password — this ensures the
  // correct credential is always used for migrations.
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (dbPassword) {
    try {
      const u = new URL(cs);
      u.password = encodeURIComponent(dbPassword);
      cs = u.toString();
    } catch {
      // not a valid URL — leave as-is
    }
  }

  return cs;
}

const connectionString = buildConnectionString();

// Also treat short hostnames (no dot — e.g. Replit's "helium") as local.
const isLocalDb =
  /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(connectionString) ||
  (() => {
    try {
      return !new URL(connectionString).hostname.includes(".");
    } catch {
      return false;
    }
  })();

// Supabase pooler uses a self-signed certificate chain.  We must pass
// rejectUnauthorized:false AND override checkServerIdentity to prevent
// newer versions of node-postgres from re-enabling strict verification
// via the sslmode=require query parameter.
const sslConfig = isLocalDb
  ? undefined
  : { rejectUnauthorized: false, checkServerIdentity: (): undefined => undefined };

const pool = new Pool({
  connectionString,
  ...(sslConfig ? { ssl: sslConfig } : {}),
});

// Pre-create the drizzle tracking schema OUTSIDE any transaction.
// Supabase session pooler (PgBouncer in transaction mode, port 5432) rejects
// CREATE SCHEMA when Drizzle's migrator runs it inside a transaction block
// on first-run setup.  Creating it here beforehand is idempotent and safe.
const client = await pool.connect();
try {
  await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
  await client.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);
} catch (err) {
  console.error(
    "Failed to pre-create drizzle tracking schema:",
    err instanceof Error ? err.message : err,
  );
  client.release();
  await pool.end();
  process.exit(1);
} finally {
  client.release();
}

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
