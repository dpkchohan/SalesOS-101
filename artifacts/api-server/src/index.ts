import app from "./app";
import { logger } from "./lib/logger";
import { cleanupTempFiles } from "./jobs/cleanupTempFiles";
import { checkMigrations } from "./lib/migrationCheck";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Migration health check ─────────────────────────────────────────────────
// Run the check BEFORE binding the port so that /api/healthz always reflects
// the true migration state from the first request onward (no false-healthy
// window for load-balancer probes).
//
// Set REQUIRE_MIGRATIONS_UP_TO_DATE=true to abort startup when pending
// migrations are detected — useful in production deploys that bypass
// migrate-and-start.sh.
async function runMigrationCheck(): Promise<void> {
  try {
    const status = await checkMigrations();

    if (status.ok) {
      logger.info(
        { applied: status.applied, total: status.total },
        "migrationCheck: all migrations applied",
      );
    } else if (status.error && status.total === 0) {
      logger.warn(
        { error: status.error },
        "migrationCheck: could not verify migration state — set MIGRATIONS_DIR if the journal cannot be found",
      );
    } else if (status.error) {
      logger.warn(
        { error: status.error, total: status.total },
        "migrationCheck: could not verify migration state — database may be unreachable",
      );
    } else {
      logger.warn(
        { pending: status.pending, applied: status.applied, total: status.total },
        "migrationCheck: PENDING MIGRATIONS DETECTED — run migrate-and-start.sh or `pnpm --filter @workspace/db run migrate` to apply them",
      );

      if (process.env["REQUIRE_MIGRATIONS_UP_TO_DATE"] === "true") {
        logger.error(
          "REQUIRE_MIGRATIONS_UP_TO_DATE=true — refusing to start with unapplied migrations",
        );
        process.exit(1);
      }
    }
  } catch (err) {
    // Never block startup for an unexpected check error — log and continue.
    logger.warn({ err }, "migrationCheck: unexpected error during migration check — continuing");
  }
}

async function startup(): Promise<void> {
  // Run the migration check before binding the port so the cached result is
  // ready the moment the first health probe arrives.
  await runMigrationCheck();

  app.listen(port, "0.0.0.0", () => {
    logger.info({ port, host: "0.0.0.0" }, "Server listening");

    // ── Background jobs ──────────────────────────────────────────────────────
    // Run the temp-file cleanup immediately on startup, then every 5 minutes.
    // Each invocation is independent — if one cycle throws, it is logged and
    // the next cycle runs normally.
    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

    function runCleanup(): void {
      cleanupTempFiles().catch((err: unknown) => {
        logger.error({ err }, "cleanupTempFiles: unhandled error — will retry next cycle");
      });
    }

    runCleanup(); // eager first run so we don't wait 5 min after a deploy
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  });
}

startup().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
