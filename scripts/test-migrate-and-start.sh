#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# test-migrate-and-start.sh
#
# Unit tests for the alert logic in migrate-and-start.sh.
# Stubs out pnpm (to force a migration failure) and curl (to capture calls)
# so no real database, npm registry, or webhook endpoint is needed.
#
# Usage:
#   sh scripts/test-migrate-and-start.sh
#
# Exit code: 0 if all tests pass, 1 if any test fails.
# ---------------------------------------------------------------------------
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATE_SCRIPT="${SCRIPT_DIR}/migrate-and-start.sh"

TMPROOT="$(mktemp -d)"
MOCK_BIN="${TMPROOT}/bin"

# Exported so the mock curl binary can read it at runtime.
export CURL_LOG="${TMPROOT}/curl_calls.log"

# A scratch workspace with an empty migrations directory so the lint step
# finds the directory and exits 0 (no SQL files → no issues found).
WORK_DIR="${TMPROOT}/workspace"
mkdir -p "$MOCK_BIN" "$WORK_DIR/lib/db/migrations"

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
    printf '       expected pattern : %s\n' "$_pat" >&2
    printf '       actual output    :\n%s\n' "$_out" >&2
  fi
}

assert_file_contains() {
  _lbl="$1"; _file="$2"; _pat="$3"
  if [ -f "$_file" ] && grep -qF "$_pat" "$_file"; then
    _pass "$_lbl"
  else
    _fail "$_lbl"
    printf '       expected pattern in file : %s\n' "$_pat" >&2
    printf '       file contents            : %s\n' "$(cat "$_file" 2>/dev/null || echo '<absent>')" >&2
  fi
}

assert_file_not_exists() {
  _lbl="$1"; _file="$2"
  if [ -f "$_file" ]; then
    _fail "$_lbl"
    printf '       file exists but should not: %s\n' "$_file" >&2
    printf '       contents: %s\n' "$(cat "$_file")" >&2
  else
    _pass "$_lbl"
  fi
}

# ---------------------------------------------------------------------------
# Mock binaries
# ---------------------------------------------------------------------------

# pnpm: always exits 1 to simulate a migration failure.
cat > "${MOCK_BIN}/pnpm" <<'EOF'
#!/usr/bin/env sh
exit 1
EOF

# psql: always exits 0 so the connectivity pre-check passes.
cat > "${MOCK_BIN}/psql" <<'EOF'
#!/usr/bin/env sh
exit 0
EOF

# curl: appends all arguments as a single space-joined line to $CURL_LOG,
# then exits 0 so send_alert does not print its warning message.
cat > "${MOCK_BIN}/curl" <<'EOF'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "$CURL_LOG"
exit 0
EOF

chmod +x "${MOCK_BIN}/pnpm" "${MOCK_BIN}/psql" "${MOCK_BIN}/curl"

# ---------------------------------------------------------------------------
# run_migrate [KEY=VALUE ...]
# Runs migrate-and-start.sh from WORK_DIR with mock binaries on PATH.
# Always succeeds at the shell level (|| true) so tests can inspect output.
# psql is not in MOCK_BIN so the connectivity pre-check is skipped cleanly.
# ---------------------------------------------------------------------------
run_migrate() {
  (cd "$WORK_DIR" && \
   env PATH="${MOCK_BIN}:${PATH}" \
       DATABASE_URL="postgres://fake/db" \
       "$@" \
       sh "$MIGRATE_SCRIPT" 2>&1) || true
}

# ---------------------------------------------------------------------------
# TEST 1: Migration failure → curl called with the alert payload
# ---------------------------------------------------------------------------
printf '\n--- Test 1: Migration failure sends alert when webhook is set ---\n'
rm -f "$CURL_LOG"
OUT1="$(run_migrate MIGRATION_ALERT_WEBHOOK="https://hooks.example.com/test")"

assert_contains \
  "T1: script reports MIGRATION FAILED on stdout/stderr" \
  "$OUT1" \
  "MIGRATION FAILED"

assert_file_contains \
  "T1: curl called with 'MIGRATION FAILED' in JSON payload" \
  "$CURL_LOG" \
  "MIGRATION FAILED"

assert_file_contains \
  "T1: curl called with Content-Type: application/json header" \
  "$CURL_LOG" \
  "Content-Type: application/json"

assert_file_contains \
  "T1: curl called with the configured webhook URL" \
  "$CURL_LOG" \
  "https://hooks.example.com/test"

# ---------------------------------------------------------------------------
# TEST 2: No webhook set → curl is never called
# ---------------------------------------------------------------------------
printf '\n--- Test 2: No alert when webhook env vars are unset ---\n'
rm -f "$CURL_LOG"
OUT2="$(run_migrate)"

assert_contains \
  "T2: script still reports MIGRATION FAILED" \
  "$OUT2" \
  "MIGRATION FAILED"

assert_file_not_exists \
  "T2: curl not called when no webhook is configured" \
  "$CURL_LOG"

# ---------------------------------------------------------------------------
# TEST 3: BACKUP_ALERT_WEBHOOK used when MIGRATION_ALERT_WEBHOOK is unset
# ---------------------------------------------------------------------------
printf '\n--- Test 3: Falls back to BACKUP_ALERT_WEBHOOK ---\n'
rm -f "$CURL_LOG"
OUT3="$(run_migrate BACKUP_ALERT_WEBHOOK="https://hooks.example.com/backup-fallback")"

assert_file_contains \
  "T3: curl called with fallback BACKUP_ALERT_WEBHOOK URL" \
  "$CURL_LOG" \
  "https://hooks.example.com/backup-fallback"

assert_file_contains \
  "T3: fallback alert still carries MIGRATION FAILED payload" \
  "$CURL_LOG" \
  "MIGRATION FAILED"

# ---------------------------------------------------------------------------
# TEST 4: MIGRATION_ALERT_WEBHOOK takes precedence over BACKUP_ALERT_WEBHOOK
# ---------------------------------------------------------------------------
printf '\n--- Test 4: MIGRATION_ALERT_WEBHOOK takes precedence ---\n'
rm -f "$CURL_LOG"
OUT4="$(run_migrate \
  MIGRATION_ALERT_WEBHOOK="https://hooks.example.com/primary" \
  BACKUP_ALERT_WEBHOOK="https://hooks.example.com/fallback")"

assert_file_contains \
  "T4: curl targets the primary MIGRATION_ALERT_WEBHOOK" \
  "$CURL_LOG" \
  "https://hooks.example.com/primary"

# The fallback URL must NOT appear — only one webhook call should be made.
if [ -f "$CURL_LOG" ] && grep -qF "https://hooks.example.com/fallback" "$CURL_LOG"; then
  _fail "T4: fallback URL should NOT be used when primary is set"
else
  _pass "T4: fallback URL not used when primary webhook is configured"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n========================================\n'
printf 'Results: %d passed, %d failed\n' "$PASS" "$FAIL"
printf '========================================\n'

[ "$FAIL" -eq 0 ]
