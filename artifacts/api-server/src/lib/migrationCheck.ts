import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface MigrationStatus {
  ok: boolean;
  applied: number;
  total: number;
  pending: string[];
  error?: string;
}

let cachedStatus: MigrationStatus | null = null;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------
// The server may be started from several working directories:
//   - workspace root  (migrate-and-start.sh, production)
//   - artifacts/api-server  (pnpm --filter @workspace/api-server run dev)
// The compiled bundle also lives at a different depth than the source file.
// We probe candidate paths and use the first one that actually contains the
// journal, so the check is robust to all startup modes.
function findMigrationsDir(): string | null {
  // Env-var override for environments where the path can't be auto-detected.
  if (process.env["MIGRATIONS_DIR"] && existsSync(process.env["MIGRATIONS_DIR"])) {
    return process.env["MIGRATIONS_DIR"];
  }

  const __filename = fileURLToPath(import.meta.url);
  const moduleDir = path.dirname(__filename);

  const candidates = [
    // Production bundle: artifacts/api-server/dist/ → workspace root
    path.resolve(moduleDir, "../../.."),
    // Dev source:        artifacts/api-server/src/lib/ → workspace root
    path.resolve(moduleDir, "../../../.."),
    // CWD = workspace root (migrate-and-start.sh)
    path.resolve(process.cwd()),
    // CWD = artifacts/api-server (pnpm filter run)
    path.resolve(process.cwd(), "../.."),
  ];

  for (const base of candidates) {
    const migrationsDir = path.join(base, "lib/db/migrations");
    if (existsSync(path.join(migrationsDir, "meta/_journal.json"))) {
      return migrationsDir;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hash computation — mirrors drizzle-orm's readMigrationFiles() so that the
// hashes we compute match the ones Drizzle stored in __drizzle_migrations.
// ---------------------------------------------------------------------------
function computeSqlHash(sql: string): string {
  const normalized = sql.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
  breakpoints: boolean;
}

interface ExpectedMigration {
  tag: string;
  hash: string;
}

function readExpectedMigrations(migrationsDir: string): ExpectedMigration[] {
  const journalPath = path.join(migrationsDir, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: JournalEntry[];
  };

  return journal.entries.map((entry) => {
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
    const sql = readFileSync(sqlPath, "utf-8");
    return { tag: entry.tag, hash: computeSqlHash(sql) };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkMigrations(): Promise<MigrationStatus> {
  // Locate the migrations directory.
  const migrationsDir = findMigrationsDir();

  if (!migrationsDir) {
    const msg =
      "Could not locate lib/db/migrations directory — set MIGRATIONS_DIR to override";
    logger.warn({ migrationsDir }, `migrationCheck: ${msg}`);
    const status: MigrationStatus = {
      ok: false,
      applied: 0,
      total: 0,
      pending: [],
      error: msg,
    };
    cachedStatus = status;
    return status;
  }

  // Read expected migrations from the journal + SQL files.
  let expected: ExpectedMigration[];
  try {
    expected = readExpectedMigrations(migrationsDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, migrationsDir }, "migrationCheck: failed to read migration files");
    const status: MigrationStatus = {
      ok: false,
      applied: 0,
      total: 0,
      pending: [],
      error: msg,
    };
    cachedStatus = status;
    return status;
  }

  const total = expected.length;

  // Query applied migration hashes from Drizzle's migrations table, in the
  // order they were applied (id ascending = insertion order).
  let appliedHashes: string[];
  try {
    const result = await pool.query<{ hash: string }>(
      `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id ASC`,
    );
    appliedHashes = result.rows.map((r) => r.hash);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      { err },
      "migrationCheck: could not query drizzle.__drizzle_migrations — treating all migrations as pending",
    );
    const status: MigrationStatus = {
      ok: false,
      applied: 0,
      total,
      pending: expected.map((e) => e.tag),
      error: msg,
    };
    cachedStatus = status;
    return status;
  }

  // Identify pending migrations: expected entries whose hash is not present
  // in the applied set (preserving journal order for clear reporting).
  const appliedSet = new Set(appliedHashes);
  const pending = expected
    .filter((e) => !appliedSet.has(e.hash))
    .map((e) => e.tag);

  const applied = total - pending.length;
  const ok = pending.length === 0;

  const status: MigrationStatus = { ok, applied, total, pending };
  cachedStatus = status;
  return status;
}

export function getMigrationStatus(): MigrationStatus | null {
  return cachedStatus;
}
