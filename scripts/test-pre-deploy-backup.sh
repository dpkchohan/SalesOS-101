#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# test-pre-deploy-backup.sh
#
# Unit tests for the retention-cleanup logic in pre-deploy-backup.sh.
# Runs entirely with mock cloud CLIs — no real AWS/GCS credentials needed.
#
# Usage:
#   sh scripts/test-pre-deploy-backup.sh
#
# Exit code: 0 if all tests pass, 1 if any test fails.
# ---------------------------------------------------------------------------
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/pre-deploy-backup.sh"

# ---------------------------------------------------------------------------
# Temp workspace shared between the test runner and the mock binaries.
# Mock binaries read/write these paths via env vars so no string-escaping
# is needed inside heredocs.
# ---------------------------------------------------------------------------
TMPROOT="$(mktemp -d)"
MOCK_BIN="${TMPROOT}/bin"
export MOCK_LS_RESPONSE="${TMPROOT}/ls_response.txt"
export MOCK_RM_LOG="${TMPROOT}/rm_calls.log"

mkdir -p "$MOCK_BIN"

cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

_pass() { printf 'PASS  %s\n' "$1"; PASS=$((PASS + 1)); }
_fail() { printf 'FAIL  %s\n' "$1" >&2; FAIL=$((FAIL + 1)); }

assert_contains() {
  _lbl="$1"; _out="$2"; _pat="$3"
  if printf '%s' "$_out" | grep -qF "$_pat"; then
    _pass "$_lbl"
  else
    _fail "$_lbl"
    printf '       expected pattern: %s\n' "$_pat" >&2
    printf '       actual output:\n%s\n' "$_out" >&2
  fi
}

assert_file_contains() {
  _lbl="$1"; _file="$2"; _pat="$3"
  if [ -f "$_file" ] && grep -qF "$_pat" "$_file"; then
    _pass "$_lbl"
  else
    _fail "$_lbl"
    printf '       expected pattern in file: %s\n' "$_pat" >&2
    printf '       file contents: %s\n' "$(cat "$_file" 2>/dev/null)" >&2
  fi
}

assert_file_not_contains() {
  _lbl="$1"; _file="$2"; _pat="$3"
  if [ -f "$_file" ] && grep -qF "$_pat" "$_file"; then
    _fail "$_lbl"
    printf '       unexpected pattern in file: %s\n' "$_pat" >&2
    printf '       file contents: %s\n' "$(cat "$_file")" >&2
  else
    _pass "$_lbl"
  fi
}

# ---------------------------------------------------------------------------
# Mock binaries
# All mocks reference $MOCK_LS_RESPONSE and $MOCK_RM_LOG at runtime via env.
# ---------------------------------------------------------------------------

# pg_dump: touch the --file= path so the backup script can proceed
cat > "${MOCK_BIN}/pg_dump" <<'EOF'
#!/usr/bin/env sh
for _arg in "$@"; do
  case "$_arg" in --file=*) touch "${_arg#--file=}" ;; esac
done
exit 0
EOF

# aws: handles s3 cp (upload), s3 ls (list), s3 rm (delete)
cat > "${MOCK_BIN}/aws" <<'EOF'
#!/usr/bin/env sh
case "$1 $2" in
  "s3 cp") exit 0 ;;
  "s3 ls") cat "$MOCK_LS_RESPONSE" 2>/dev/null || true ;;
  "s3 rm") printf '%s\n' "$3" >> "$MOCK_RM_LOG" ;;
esac
EOF

# gsutil: handles cp (upload), ls (list), rm (delete)
cat > "${MOCK_BIN}/gsutil" <<'EOF'
#!/usr/bin/env sh
case "$1" in
  cp) exit 0 ;;
  ls) cat "$MOCK_LS_RESPONSE" 2>/dev/null || true ;;
  rm) printf '%s\n' "$2" >> "$MOCK_RM_LOG" ;;
esac
EOF

# curl: no-op (alert webhook calls)
cat > "${MOCK_BIN}/curl" <<'EOF'
#!/usr/bin/env sh
exit 0
EOF

chmod +x "${MOCK_BIN}/pg_dump" "${MOCK_BIN}/aws" \
         "${MOCK_BIN}/gsutil" "${MOCK_BIN}/curl"

# ---------------------------------------------------------------------------
# run_script ENV_VARS...
# Runs the backup script in a subshell with the mock bin dir first on PATH.
# Extra KEY=VALUE pairs are passed as environment overrides.
# Always succeeds at the shell level (|| true) so we can check output freely.
# BACKUP_RETAIN_LOCAL=true prevents the script from deleting the local dump,
# which avoids a spurious error when the mock pg_dump creates it.
# ---------------------------------------------------------------------------
run_script() {
  env PATH="${MOCK_BIN}:${PATH}" \
      BACKUP_RETAIN_LOCAL=true \
      DATABASE_URL="postgres://fake/db" \
      BACKUP_STORAGE_BUCKET="s3://test-bucket/backups/" \
      "$@" \
      sh "$BACKUP_SCRIPT" 2>&1 || true
}

# Reset the RM log between tests
reset_rm_log() { rm -f "$MOCK_RM_LOG"; }

# ---------------------------------------------------------------------------
# Compute date strings for the retention window tests.
# Uses GNU date (-d flag); skip those tests gracefully if not available.
# ---------------------------------------------------------------------------
RETAIN_DAYS=30
CUTOFF_DATE="$(date -d "${RETAIN_DAYS} days ago" +%Y%m%d 2>/dev/null)" || CUTOFF_DATE=""
OLD_DATE="$(date -d "60 days ago" +%Y%m%d 2>/dev/null)" || OLD_DATE=""
RECENT_DATE="$(date +%Y%m%d 2>/dev/null)" || RECENT_DATE=""

# ---------------------------------------------------------------------------
# TEST 1: BACKUP_RETAIN_DAYS unset → cleanup skipped with a log message
# ---------------------------------------------------------------------------
printf '\n--- Test 1: BACKUP_RETAIN_DAYS unset ---\n'
reset_rm_log
OUT1="$(run_script)"
assert_contains \
  "T1: skipped message logged when BACKUP_RETAIN_DAYS unset" \
  "$OUT1" \
  "skipping remote retention cleanup"
assert_file_not_contains \
  "T1: no deletions triggered when BACKUP_RETAIN_DAYS unset" \
  "$MOCK_RM_LOG" \
  "backup_"

# ---------------------------------------------------------------------------
# TEST 2: BACKUP_RETAIN_DAYS set to a non-integer → warning, no deletion
# ---------------------------------------------------------------------------
printf '\n--- Test 2: BACKUP_RETAIN_DAYS non-integer ---\n'
reset_rm_log
OUT2="$(run_script BACKUP_RETAIN_DAYS="thirty")"
assert_contains \
  "T2: warning logged for non-integer BACKUP_RETAIN_DAYS" \
  "$OUT2" \
  "not a positive integer"
assert_file_not_contains \
  "T2: no deletions triggered for non-integer BACKUP_RETAIN_DAYS" \
  "$MOCK_RM_LOG" \
  "backup_"

# ---------------------------------------------------------------------------
# TEST 3: Old filename (before cutoff) → matched and deleted
# ---------------------------------------------------------------------------
printf '\n--- Test 3: Old backup deleted ---\n'
if [ -z "$OLD_DATE" ] || [ -z "$CUTOFF_DATE" ]; then
  printf 'SKIP  T3+T4: GNU date not available on this platform\n'
else
  reset_rm_log
  OLD_FNAME="backup_${OLD_DATE}_120000.dump"
  # S3 ls format: DATE TIME SIZE FILENAME
  printf '2020-01-01 12:00:00       1024 %s\n' "$OLD_FNAME" > "$MOCK_LS_RESPONSE"
  OUT3="$(run_script BACKUP_RETAIN_DAYS="${RETAIN_DAYS}")"
  assert_contains \
    "T3: old backup deletion logged" \
    "$OUT3" \
    "Deleting old backup"
  assert_file_contains \
    "T3: old backup actually passed to aws s3 rm" \
    "$MOCK_RM_LOG" \
    "$OLD_FNAME"

  # ---------------------------------------------------------------------------
  # TEST 4: Recent filename (on or after cutoff) → left alone
  # ---------------------------------------------------------------------------
  printf '\n--- Test 4: Recent backup kept ---\n'
  reset_rm_log
  RECENT_FNAME="backup_${RECENT_DATE}_120000.dump"
  printf '2020-01-01 12:00:00       1024 %s\n' "$RECENT_FNAME" > "$MOCK_LS_RESPONSE"
  OUT4="$(run_script BACKUP_RETAIN_DAYS="${RETAIN_DAYS}")"
  assert_file_not_contains \
    "T4: recent backup not passed to aws s3 rm" \
    "$MOCK_RM_LOG" \
    "$RECENT_FNAME"
  assert_contains \
    "T4: retention cleanup ran to completion" \
    "$OUT4" \
    "Retention cleanup complete"
fi

# ---------------------------------------------------------------------------
# TEST 5 (bonus): gsutil path — old GCS backup is deleted
# ---------------------------------------------------------------------------
printf '\n--- Test 5: GCS old backup deleted via gsutil ---\n'
if [ -z "$OLD_DATE" ]; then
  printf 'SKIP  T5: GNU date not available on this platform\n'
else
  reset_rm_log
  GCS_BUCKET="gs://gcs-test-bucket/backups/"
  OLD_GCS_FNAME="backup_${OLD_DATE}_120000.dump"
  # gsutil ls -l format: SIZE  DATE  gs://bucket/prefix/filename
  printf '      1024  2020-01-01T12:00:00Z  %s%s\n' "$GCS_BUCKET" "$OLD_GCS_FNAME" \
    > "$MOCK_LS_RESPONSE"
  OUT5="$(run_script BACKUP_RETAIN_DAYS="${RETAIN_DAYS}" \
                     BACKUP_STORAGE_BUCKET="${GCS_BUCKET}")"
  assert_file_contains \
    "T5: GCS old backup passed to gsutil rm" \
    "$MOCK_RM_LOG" \
    "$OLD_GCS_FNAME"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n========================================\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
printf '========================================\n'

[ "$FAIL" -eq 0 ]
