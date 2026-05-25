#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# lint-migrations.sh
#
# Scans all SQL migration files in lib/db/migrations/ for non-idempotent
# patterns that could cause a migration to fail on re-run.
#
# Checks performed:
#   1. ALTER TABLE … ADD COLUMN not wrapped in a duplicate_column handler
#   2. CREATE INDEX without IF NOT EXISTS
#   3. CREATE UNIQUE INDEX without IF NOT EXISTS
#   4. CREATE TABLE without IF NOT EXISTS
#   5. DROP TABLE without IF EXISTS
#   6. ALTER TABLE … DROP COLUMN without IF EXISTS
#   7. DROP INDEX without IF EXISTS
#
# Exit codes:
#   0 — all migrations are idempotent
#   1 — one or more non-idempotent patterns found (details printed to stderr)
#
# See docs/migration-recovery.md for the full idempotency authoring guide.
# ---------------------------------------------------------------------------

MIGRATIONS_DIR="${1:-lib/db/migrations}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

found_issues=0

# ---------------------------------------------------------------------------
# check_file FILE
# Runs all pattern checks against a single SQL file.
# Sets found_issues=1 and prints a descriptive error for every violation.
# ---------------------------------------------------------------------------
check_file() {
  file="$1"

  # ------------------------------------------------------------------
  # Check 1: ALTER TABLE … ADD COLUMN outside a DO $$ block
  #
  # Safe form:
  #   DO $$ BEGIN
  #     ALTER TABLE "t" ADD COLUMN "c" text;
  #   EXCEPTION
  #     WHEN duplicate_column THEN null;
  #   END $$;
  #
  # The awk script tracks whether we are inside a DO $$ / END $$ block.
  # A bare ALTER TABLE … ADD COLUMN outside such a block is flagged.
  # ------------------------------------------------------------------
  result="$(awk '
    /[Dd][Oo][[:space:]]+\$\$/ { in_do = 1 }
    /[Ee][Nn][Dd][[:space:]]+\$\$/ { in_do = 0; next }
    /[Aa][Ll][Tt][Ee][Rr][[:space:]]+[Tt][Aa][Bb][Ll][Ee]/ &&
    /[Aa][Dd][Dd][[:space:]]+[Cc][Oo][Ll][Uu][Mm][Nn]/ &&
    !in_do {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  ALTER TABLE … ADD COLUMN must be wrapped in a duplicate_column handler." >&2
    echo "  Replace:" >&2
    echo '    ALTER TABLE "t" ADD COLUMN "c" text;' >&2
    echo "  With:" >&2
    echo '    DO $$ BEGIN' >&2
    echo '      ALTER TABLE "t" ADD COLUMN "c" text;' >&2
    echo '    EXCEPTION' >&2
    echo '      WHEN duplicate_column THEN null;' >&2
    echo '    END $$;' >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 2: CREATE INDEX without IF NOT EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Cc][Rr][Ee][Aa][Tt][Ee][[:space:]]+[Ii][Nn][Dd][Ee][Xx]/ &&
    !/[Ii][Ff][[:space:]]+[Nn][Oo][Tt][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  CREATE INDEX must use IF NOT EXISTS." >&2
    echo "  Change:  CREATE INDEX \"idx\" ON ..." >&2
    echo "  To:      CREATE INDEX IF NOT EXISTS \"idx\" ON ..." >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 3: CREATE UNIQUE INDEX without IF NOT EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Cc][Rr][Ee][Aa][Tt][Ee][[:space:]]+[Uu][Nn][Ii][Qq][Uu][Ee][[:space:]]+[Ii][Nn][Dd][Ee][Xx]/ &&
    !/[Ii][Ff][[:space:]]+[Nn][Oo][Tt][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  CREATE UNIQUE INDEX must use IF NOT EXISTS." >&2
    echo "  Change:  CREATE UNIQUE INDEX \"idx\" ON ..." >&2
    echo "  To:      CREATE UNIQUE INDEX IF NOT EXISTS \"idx\" ON ..." >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 4: CREATE TABLE without IF NOT EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Cc][Rr][Ee][Aa][Tt][Ee][[:space:]]+[Tt][Aa][Bb][Ll][Ee]/ &&
    !/[Ii][Ff][[:space:]]+[Nn][Oo][Tt][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  CREATE TABLE must use IF NOT EXISTS." >&2
    echo "  Change:  CREATE TABLE \"t\" (" >&2
    echo "  To:      CREATE TABLE IF NOT EXISTS \"t\" (" >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 5: DROP TABLE without IF EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Dd][Rr][Oo][Pp][[:space:]]+[Tt][Aa][Bb][Ll][Ee]/ &&
    !/[Ii][Ff][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  DROP TABLE must use IF EXISTS." >&2
    echo "  Change:  DROP TABLE \"t\";" >&2
    echo "  To:      DROP TABLE IF EXISTS \"t\";" >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 6: ALTER TABLE … DROP COLUMN without IF EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Aa][Ll][Tt][Ee][Rr][[:space:]]+[Tt][Aa][Bb][Ll][Ee]/ &&
    /[Dd][Rr][Oo][Pp][[:space:]]+[Cc][Oo][Ll][Uu][Mm][Nn]/ &&
    !/[Ii][Ff][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  ALTER TABLE … DROP COLUMN must use IF EXISTS." >&2
    echo '  Change:  ALTER TABLE "t" DROP COLUMN "c";' >&2
    echo '  To:      ALTER TABLE "t" DROP COLUMN IF EXISTS "c";' >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi

  # ------------------------------------------------------------------
  # Check 7: DROP INDEX without IF EXISTS
  # ------------------------------------------------------------------
  result="$(awk '
    /[Dd][Rr][Oo][Pp][[:space:]]+[Ii][Nn][Dd][Ee][Xx]/ &&
    !/[Ii][Ff][[:space:]]+[Ee][Xx][Ii][Ss][Tt][Ss]/ {
      print NR ": " $0
    }
  ' "$file")"

  if [ -n "$result" ]; then
    found_issues=1
    echo "" >&2
    echo "FAIL  $file" >&2
    echo "  DROP INDEX must use IF EXISTS." >&2
    echo '  Change:  DROP INDEX "idx";' >&2
    echo '  To:      DROP INDEX IF EXISTS "idx";' >&2
    echo "  Offending line(s):" >&2
    printf '%s\n' "$result" | while IFS= read -r line; do
      echo "    Line $line" >&2
    done
  fi
}

# ---------------------------------------------------------------------------
# Scan all .sql files in the migrations directory (non-recursive; Drizzle
# keeps all migration files flat in one directory).
# ---------------------------------------------------------------------------
sql_files_found=0
for sql_file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$sql_file" ] || continue
  sql_files_found=1
  check_file "$sql_file"
done

if [ "$sql_files_found" -eq 0 ]; then
  echo "WARNING: No SQL files found in $MIGRATIONS_DIR" >&2
  exit 0
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [ "$found_issues" -eq 0 ]; then
  echo "Migration lint passed — all SQL files in $MIGRATIONS_DIR are idempotent."
  exit 0
else
  echo "" >&2
  echo "================================================================" >&2
  echo "  MIGRATION LINT FAILED" >&2
  echo "" >&2
  echo "  One or more migration files contain non-idempotent SQL." >&2
  echo "  Fix the statements listed above before committing." >&2
  echo "  See docs/migration-recovery.md for the authoring guide." >&2
  echo "================================================================" >&2
  exit 1
fi
