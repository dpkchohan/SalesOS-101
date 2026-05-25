#!/usr/bin/env sh
set -e

# ---------------------------------------------------------------------------
# migrate-and-start.sh
#
# 1. Verifies the database is reachable before attempting migrations.
# 2. Runs Drizzle migrations.
# 3. On failure, prints a clear recovery hint and exits non-zero so the
#    container/process supervisor does NOT start the server against a
#    potentially broken schema.
#
# Recovery guide: docs/migration-recovery.md
# ---------------------------------------------------------------------------

DB_URL="${SUPABASE_SESSION_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "ERROR: No database connection string found." >&2
  echo "       Set SUPABASE_SESSION_URL or DATABASE_URL." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Optional pre-deploy backup (set BACKUP_BEFORE_MIGRATE=true to enable).
# Runs scripts/pre-deploy-backup.sh and exits on failure so migrations never
# run against a database whose backup could not be taken.
# ---------------------------------------------------------------------------
if [ "${BACKUP_BEFORE_MIGRATE:-false}" = "true" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  echo "BACKUP_BEFORE_MIGRATE=true — running pre-deploy backup..."
  if ! sh "$SCRIPT_DIR/pre-deploy-backup.sh"; then
    echo "ERROR: Pre-deploy backup failed — aborting deploy." >&2
    echo "       Fix the backup error or unset BACKUP_BEFORE_MIGRATE to skip." >&2
    exit 1
  fi
  echo "Pre-deploy backup complete."
fi

# ---------------------------------------------------------------------------
# Pre-flight: verify the database is reachable before touching the schema.
# ---------------------------------------------------------------------------
echo "Checking database connectivity..."
if command -v psql > /dev/null 2>&1; then
  if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to the database. Check your connection string and network access." >&2
    exit 1
  fi
  echo "Database is reachable."
else
  echo "psql not found — skipping connectivity pre-check."
fi

# ---------------------------------------------------------------------------
# Run migrations.
# On failure, print guidance and exit non-zero so the server never starts
# against a partially-migrated schema.
# ---------------------------------------------------------------------------
echo "Running database migrations..."
if ! pnpm --filter @workspace/db run migrate; then
  echo "" >&2
  echo "================================================================" >&2
  echo "  MIGRATION FAILED — server will NOT start." >&2
  echo "" >&2
  echo "  The database may be in a partially-applied state." >&2
  echo "  Follow the recovery steps in docs/migration-recovery.md" >&2
  echo "  before attempting another deploy." >&2
  echo "================================================================" >&2
  exit 1
fi

echo "Migrations complete. Starting server..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
