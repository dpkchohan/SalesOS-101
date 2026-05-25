#!/usr/bin/env sh
set -e

# ---------------------------------------------------------------------------
# pre-deploy-backup.sh
#
# Takes a pg_dump of the database and uploads it to object storage before
# migrations run, giving you a restore point if something goes wrong.
#
# Required env vars:
#   SUPABASE_SESSION_URL or DATABASE_URL  — Postgres connection string
#
# Optional env vars:
#   BACKUP_STORAGE_BUCKET  — destination for the dump file, in one of:
#                            s3://bucket/prefix/   (AWS S3 or S3-compatible)
#                            gs://bucket/prefix/   (Google Cloud Storage)
#                            If unset, the dump is kept only on disk at
#                            /tmp/db_backups/ for the lifetime of the process.
#   BACKUP_RETAIN_LOCAL    — set to "true" to keep the local dump file even
#                            after a successful upload (default: deleted).
#
# Upload tools used (whichever is found first):
#   AWS S3 / S3-compatible  → aws cli   (s3:// prefix)
#   Google Cloud Storage    → gsutil     (gs:// prefix)
#
# Restore:
#   pg_restore --dbname "$DATABASE_URL" --clean backup_YYYYMMDD_HHMMSS.dump
#
# See also: docs/migration-recovery.md
# ---------------------------------------------------------------------------

DB_URL="${SUPABASE_SESSION_URL:-$DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "ERROR: No database connection string found." >&2
  echo "       Set SUPABASE_SESSION_URL or DATABASE_URL." >&2
  exit 1
fi

if ! command -v pg_dump > /dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install postgresql-client before running this script." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/tmp/db_backups"
BACKUP_FILE="backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

mkdir -p "$BACKUP_DIR"

echo "Starting database backup (${TIMESTAMP})..."
if ! pg_dump "$DB_URL" --format=custom --file="$BACKUP_PATH"; then
  echo "ERROR: pg_dump failed — aborting backup." >&2
  exit 1
fi

BACKUP_SIZE="$(du -sh "$BACKUP_PATH" | cut -f1)"
echo "Backup created: ${BACKUP_PATH} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Upload to remote storage if BACKUP_STORAGE_BUCKET is configured.
# ---------------------------------------------------------------------------
if [ -z "$BACKUP_STORAGE_BUCKET" ]; then
  echo "BACKUP_STORAGE_BUCKET is not set — backup kept locally at ${BACKUP_PATH}."
  echo "Set BACKUP_STORAGE_BUCKET to an s3:// or gs:// destination to persist backups."
  exit 0
fi

# Normalise: ensure the bucket path ends with a slash so we can append the filename.
BUCKET_PREFIX="${BACKUP_STORAGE_BUCKET%/}/"
REMOTE_DEST="${BUCKET_PREFIX}${BACKUP_FILE}"

case "$BACKUP_STORAGE_BUCKET" in
  s3://*)
    if ! command -v aws > /dev/null 2>&1; then
      echo "ERROR: aws CLI not found but BACKUP_STORAGE_BUCKET is an s3:// destination." >&2
      echo "       Install the AWS CLI or switch to a gs:// bucket with gsutil." >&2
      exit 1
    fi
    echo "Uploading to S3: ${REMOTE_DEST} ..."
    aws s3 cp "$BACKUP_PATH" "$REMOTE_DEST"
    ;;
  gs://*)
    if ! command -v gsutil > /dev/null 2>&1; then
      echo "ERROR: gsutil not found but BACKUP_STORAGE_BUCKET is a gs:// destination." >&2
      echo "       Install the Google Cloud SDK or switch to an s3:// bucket with the AWS CLI." >&2
      exit 1
    fi
    echo "Uploading to GCS: ${REMOTE_DEST} ..."
    gsutil cp "$BACKUP_PATH" "$REMOTE_DEST"
    ;;
  *)
    echo "ERROR: Unrecognised BACKUP_STORAGE_BUCKET scheme: ${BACKUP_STORAGE_BUCKET}" >&2
    echo "       Use an s3:// or gs:// destination." >&2
    exit 1
    ;;
esac

echo "Backup uploaded successfully: ${REMOTE_DEST}"

# Clean up the local dump unless explicitly asked to retain it.
if [ "${BACKUP_RETAIN_LOCAL:-false}" != "true" ]; then
  rm -f "$BACKUP_PATH"
  echo "Local copy removed. Set BACKUP_RETAIN_LOCAL=true to keep it."
fi
