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
# send_alert MESSAGE
# Posts a JSON {"text": "MESSAGE"} payload to MIGRATION_ALERT_WEBHOOK if set,
# falling back to BACKUP_ALERT_WEBHOOK.
# Failures are logged but never cause the script to exit non-zero on their own.
# ---------------------------------------------------------------------------
send_alert() {
  _msg="$1"
  _webhook="${MIGRATION_ALERT_WEBHOOK:-$BACKUP_ALERT_WEBHOOK}"
  if [ -z "$_webhook" ]; then
    return 0
  fi
  if ! command -v curl > /dev/null 2>&1; then
    echo "WARNING: Alert webhook is set but curl is not available — alert not sent." >&2
    return 0
  fi
  _escaped="$(printf '%s' "$_msg" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/g' | tr -d '\n' | sed 's/\\n$//')"
  curl --silent --max-time 10 \
    --header "Content-Type: application/json" \
    --data "{\"text\": \"$_escaped\"}" \
    "$_webhook" > /dev/null 2>&1 || \
    echo "WARNING: Failed to deliver alert to webhook." >&2
}

# ---------------------------------------------------------------------------
# Optional pre-deploy backup (set BACKUP_BEFORE_MIGRATE=true to enable).
# Runs scripts/pre-deploy-backup.sh and exits on failure so migrations never
# run against a database whose backup could not be taken.
#
# When running in a production-like environment (NODE_ENV=production) and
# BACKUP_BEFORE_MIGRATE is not set, a warning is printed and an alert is sent
# so the team knows the deploy proceeded without a backup.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "${BACKUP_BEFORE_MIGRATE:-false}" = "true" ]; then
  echo "BACKUP_BEFORE_MIGRATE=true — running pre-deploy backup..."
  if ! sh "$SCRIPT_DIR/pre-deploy-backup.sh"; then
    send_alert "[migrate-and-start] BACKUP FAILED: Pre-deploy backup script exited with an error. The deploy has been aborted. Fix the backup or unset BACKUP_BEFORE_MIGRATE to skip."
    echo "ERROR: Pre-deploy backup failed — aborting deploy." >&2
    echo "       Fix the backup error or unset BACKUP_BEFORE_MIGRATE to skip." >&2
    exit 1
  fi
  echo "Pre-deploy backup complete."
elif [ "${NODE_ENV:-}" = "production" ]; then
  _warn="[migrate-and-start] WARNING: Deploying to production without a pre-deploy backup. Set BACKUP_BEFORE_MIGRATE=true to enable automatic backups before migrations."
  echo "WARNING: BACKUP_BEFORE_MIGRATE is not set — skipping pre-deploy backup." >&2
  echo "         Running in NODE_ENV=production without a backup is risky." >&2
  echo "         Set BACKUP_BEFORE_MIGRATE=true to enable automatic backups." >&2
  send_alert "$_warn"
fi

# ---------------------------------------------------------------------------
# Migration lint: reject non-idempotent SQL before touching the database.
# ---------------------------------------------------------------------------
echo "Linting migrations for idempotency..."
if ! sh "$SCRIPT_DIR/lint-migrations.sh" "lib/db/migrations"; then
  echo "" >&2
  echo "================================================================" >&2
  echo "  DEPLOY ABORTED — migration lint failed." >&2
  echo "" >&2
  echo "  Fix the non-idempotent statements listed above, then redeploy." >&2
  echo "  See docs/migration-recovery.md for the authoring guide." >&2
  echo "================================================================" >&2
  exit 1
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
  _ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
  send_alert "[migrate-and-start] MIGRATION FAILED at ${_ts}: The database migration step exited with an error and the server was NOT started. The database may be in a partially-applied state. Follow the recovery steps in docs/migration-recovery.md before attempting another deploy."
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
