# Migration Recovery Guide

This document explains how to diagnose and recover from a failed or partially-applied database migration so that subsequent deploys succeed without manual database surgery.

---

## Background

Migrations are run by `scripts/migrate-and-start.sh` before the API server starts. Drizzle Kit tracks which migrations have been applied in the `drizzle.__drizzle_migrations` table. If a migration fails mid-run (e.g. a constraint violation, a column that already exists, or a connection drop), the migration may be partially applied:

- Some statements from the failing SQL file executed successfully.
- Others did not.
- Drizzle has **not** recorded the migration as complete, so it will attempt to re-run it on the next deploy — and fail again.

---

## Step 1 — Identify the problem

Check the deploy/startup logs for the error message. Common patterns:

```
Error: column "foo" of relation "bar" already exists
Error: relation "baz" already exists
Error: there is no unique constraint matching given keys for referenced table
MigrationError: Failed to apply migration "NNNN_..."
```

Note the **migration tag** from the error (e.g. `0001_add_pipeline_stages`). You will need it below.

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

Compare the output against the files in `lib/db/migrations/`. Any file whose tag does **not** appear in the table has not been recorded as complete (even if some of its DDL statements were executed).

---

## Step 4 — Repair the partially-applied migration

You have two options depending on how far the migration got:

### Option A — Finish applying the remaining statements manually

1. Open the failing SQL file, e.g. `lib/db/migrations/0001_add_pipeline_stages.sql`.
2. Work out which `statement-breakpoint` sections already executed (check via `\d tablename` or `\di indexname` in psql).
3. Execute only the statements that did **not** run yet, wrapped in a transaction so you can roll back if needed:

   ```sql
   BEGIN;

   -- paste the missing statements here, e.g.:
   ALTER TABLE leads ADD COLUMN pipeline_stage text DEFAULT 'open';
   CREATE INDEX IF NOT EXISTS leads_pipeline_idx ON leads (pipeline_stage);

   COMMIT;
   ```

4. Once the DB matches the intended end state, record the migration as applied so Drizzle does not attempt it again:

   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
   VALUES ('<hash-from-journal>', extract(epoch from now()) * 1000);
   ```

   Find the correct `hash` value in `lib/db/migrations/meta/_journal.json`.

### Option B — Roll back the partial changes and re-run

If it is safe to undo the partial changes (no data loss, no production traffic writing to the affected tables):

1. Reverse each DDL statement that did execute, e.g.:

   ```sql
   BEGIN;

   DROP INDEX IF EXISTS leads_pipeline_idx;
   ALTER TABLE leads DROP COLUMN IF EXISTS pipeline_stage;

   COMMIT;
   ```

2. Verify the migration row is **not** in `drizzle.__drizzle_migrations` (if it is, delete it):

   ```sql
   DELETE FROM drizzle.__drizzle_migrations
   WHERE id = <id-from-step-3>;
   ```

3. Fix the root cause in the migration file (or in the schema that generated it), then redeploy.

---

## Step 5 — Verify and redeploy

Before triggering a new deploy, confirm the database is in a clean state:

```sql
-- No unexpected tables or columns missing
\d leads
\d contacts

-- Migration table reflects reality
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at;
```

Then redeploy. The `migrate-and-start.sh` script will re-attempt any migration not yet recorded in the migrations table.

---

## Prevention checklist

| Practice | Why it helps |
|---|---|
| Wrap destructive DDL in `BEGIN` / `COMMIT` inside the `.sql` file | Rolls back automatically on error (Postgres DDL is transactional) |
| Use `IF NOT EXISTS` / `IF EXISTS` guards on `CREATE` and `DROP` | Makes statements idempotent so partial re-runs are safe |
| Never delete a migration file that has already been applied to any environment | Drizzle will try to fill the gap and produce unpredictable results |
| Test migrations against a staging DB before deploying to production | Catches constraint violations before they affect live data |
| Take a database backup (`pg_dump`) before each production deploy | Gives you a restore point if Option B above is needed |

---

## Quick-reference commands

```bash
# Dump the production database before a risky migration
pg_dump "$DATABASE_URL" --format=custom --file=backup_$(date +%Y%m%d_%H%M%S).dump

# Restore from a dump
pg_restore --dbname "$DATABASE_URL" --clean backup_YYYYMMDD_HHMMSS.dump

# Inspect all tables in the public schema
psql "$DATABASE_URL" -c "\dt public.*"

# Check Drizzle migration history
psql "$DATABASE_URL" -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```
