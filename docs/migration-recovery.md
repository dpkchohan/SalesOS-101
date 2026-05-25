# Migration Recovery Guide

This document explains how to diagnose and recover from a failed or partially-applied database migration so that subsequent deploys succeed without manual database surgery.

---

## Transaction safety guarantee

Every migration is run by `lib/db/src/migrate.ts`, which uses drizzle-orm's programmatic `migrate()` function. **Each migration file is automatically wrapped in its own Postgres transaction.** If a migration fails:

1. Postgres rolls back every DDL statement in that file — the database is left in the exact state it was in before the migration started.
2. Drizzle does **not** record the migration as applied.
3. The next deploy re-runs the migration from the top against a clean slate.

## Idempotency guarantee

In addition to transaction safety, all migration SQL files are written defensively so that re-running a partially-applied file cannot cause errors:

| Statement type | Guard used |
|---|---|
| `CREATE TABLE` | `IF NOT EXISTS` |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` | `IF NOT EXISTS` |
| `ALTER TABLE ADD CONSTRAINT` | Wrapped in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;` |
| `ALTER TABLE ADD COLUMN` | Must use `DO $$ BEGIN … EXCEPTION WHEN duplicate_column THEN null; END $$;` (see authoring guide below) |

Together, transaction wrapping and idempotency guards mean that **a failed migration auto-recovers on the next deploy** with no manual intervention required.

---

## Background

Migrations are run by `scripts/migrate-and-start.sh` before the API server starts. Drizzle Kit tracks which migrations have been applied in the `drizzle.__drizzle_migrations` table. If a migration fails mid-run (e.g. a connection drop or a constraint violation on actual data), the migration is rolled back automatically:

- No DDL statements from the failing file are left applied.
- Drizzle has **not** recorded the migration as complete.
- The next deploy will re-run the migration from the beginning against a clean database state.

---

## Step 1 — Identify the problem

Check the deploy/startup logs for the error message. Common patterns:

```
Migration failed: column "foo" of relation "bar" already exists
Migration failed: relation "baz" already exists
MigrationError: Failed to apply migration "NNNN_..."
```

If you see `column already exists` or `relation already exists`, the migration file is **not** fully idempotent — see [Authoring idempotent migrations](#authoring-idempotent-migrations) below and patch the file before the next deploy.

For data-level errors (e.g. a constraint violation caused by existing rows), the transaction will have rolled back cleanly — fix the data and redeploy.

---

## Step 2 — Connect to the database

Use the `DATABASE_URL` / `SUPABASE_SESSION_URL` environment variable from your hosting provider's dashboard (Supabase, Railway, etc.) to open a `psql` session:

```bash
psql "$DATABASE_URL"
```

---

## Step 3 — Check which migrations Drizzle considers applied

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at;
```

Compare the output against the files in `lib/db/migrations/`. Any file whose tag does **not** appear in the table has not been recorded as complete. Because migrations are transactional, any failed migration will not appear here — its effects were rolled back.

---

## Step 4 — Recover from a data-level failure

If the error is caused by bad data rather than DDL (e.g. a `NOT NULL` constraint violated by existing rows), fix the data first, then redeploy:

```sql
BEGIN;

-- example: back-fill a column that cannot be null
UPDATE leads SET pipeline_stage = 'open' WHERE pipeline_stage IS NULL;

COMMIT;
```

Because the migration was rolled back automatically, redeploy will re-run it from the top against the now-clean data.

---

## Step 5 — Verify and redeploy

Before triggering a new deploy, confirm the database is in a clean state:

```sql
-- Check table structure
\d leads
\d contacts

-- Migration table reflects reality
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

Then redeploy. The `migrate-and-start.sh` script will re-attempt any migration not yet recorded in the migrations table.

---

## Authoring idempotent migrations

When Drizzle generates a new migration file, review it before committing and apply the following rules. Even though the migration runner wraps each file in a transaction, idempotency guards provide an extra layer of safety (e.g. if a transaction cannot be used for a specific operation).

### `CREATE TABLE` — already safe
Drizzle always emits `CREATE TABLE IF NOT EXISTS`. No change needed.

### `CREATE INDEX` — already safe
Drizzle always emits `CREATE INDEX IF NOT EXISTS`. No change needed.

### `ALTER TABLE ADD COLUMN` — wrap in an exception handler

Drizzle emits bare `ALTER TABLE … ADD COLUMN` statements. Replace them with:

```sql
DO $$ BEGIN
  ALTER TABLE "my_table" ADD COLUMN "my_column" text;
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;
```

### `ALTER TABLE ADD CONSTRAINT` — already safe
Drizzle wraps these in `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;` blocks. No change needed.

### `DROP TABLE` / `DROP COLUMN` / `DROP INDEX` — use IF EXISTS

```sql
DROP TABLE IF EXISTS "old_table";
ALTER TABLE "my_table" DROP COLUMN IF EXISTS "old_column";
DROP INDEX IF EXISTS "old_index_name";
```

---

## Prevention checklist

| Practice | Why it helps |
|---|---|
| Use the transactional migration runner (`lib/db/src/migrate.ts`) | Each migration is atomic — failure rolls back the entire file automatically |
| Apply idempotency guards (see above) to every new migration | Extra safety layer for operations that cannot run inside a transaction |
| Never delete a migration file that has already been applied to any environment | Drizzle will try to fill the gap and produce unpredictable results |
| Test migrations against a staging DB before deploying to production | Catches constraint violations before they affect live data |
| Take a database backup (`pg_dump`) before each production deploy | Gives you a restore point — set `BACKUP_BEFORE_MIGRATE=true` to automate this via `scripts/pre-deploy-backup.sh` |

---

## Quick-reference commands

```bash
# Run migrations manually (wraps each migration in a transaction)
pnpm --filter @workspace/db run migrate

# Dump the production database before a risky migration
pg_dump "$DATABASE_URL" --format=custom --file=backup_$(date +%Y%m%d_%H%M%S).dump

# Restore from a dump
pg_restore --dbname "$DATABASE_URL" --clean backup_YYYYMMDD_HHMMSS.dump

# Inspect all tables in the public schema
psql "$DATABASE_URL" -c "\dt public.*"

# Check Drizzle migration history
psql "$DATABASE_URL" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```
