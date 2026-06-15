---
name: Dev Postgres host + migration auth
description: How to apply Drizzle migrations to the local dev Postgres when the migrate script can't connect.
---

## The situation
- Replit's local Postgres listens on host `helium` (172.24.0.3:5432), NOT `localhost`.
- `psql heliumdb` (no -U flag) connects successfully via trust auth as the `postgres` OS user.
- The bash-shell `DATABASE_URL` env var has wrong credentials — it triggers "password authentication failed for user postgres" when pg tries TCP to localhost:5432 (also ECONNREFUSED because postgres isn't on localhost).
- `SUPABASE_SESSION_URL=""` does NOT suppress the `??` fallback — empty string is non-null for `??`. Must use `unset SUPABASE_SESSION_URL`.
- Even with `unset SUPABASE_SESSION_URL`, the migrate script still fails because `DATABASE_URL` points to localhost:5432 which is ECONNREFUSED.

## How to manually apply a migration to dev Postgres

```bash
# 1. Apply the SQL directly
psql heliumdb -f lib/db/migrations/XXXX_migration_name.sql

# 2. Compute the migration hash (SHA-256 of raw SQL file content)
hash=$(node -e "const {createHash}=require('crypto');const fs=require('fs');const sql=fs.readFileSync('lib/db/migrations/XXXX_migration_name.sql','utf8');console.log(createHash('sha256').update(sql).digest('hex'))")

# 3. Insert the tracking record (use the `when` timestamp from _journal.json)
psql heliumdb -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$hash', WHEN_FROM_JOURNAL) ON CONFLICT DO NOTHING"
```

**Why:** `pnpm --filter @workspace/db run migrate` uses SUPABASE_SESSION_URL when set (goes to Supabase prod), or DATABASE_URL (broken localhost ref in bash env). Neither reaches the dev Postgres on helium.

**How to apply:** Always use `psql heliumdb` directly + manual tracking insert for dev. For production Supabase, run the migrate script normally (SUPABASE_SESSION_URL available).
