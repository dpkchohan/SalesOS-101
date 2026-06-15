import app from "./app";
import { logger } from "./lib/logger";
import { cleanupTempFiles } from "./jobs/cleanupTempFiles";
import { runGmailSync } from "./jobs/gmailSync";
import { checkMigrations } from "./lib/migrationCheck";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

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
    logger.warn({ err }, "migrationCheck: unexpected error during migration check — continuing");
  }
}

async function startup(): Promise<void> {
  await runMigrationCheck();

  app.listen(port, "0.0.0.0", () => {
    logger.info({ port, host: "0.0.0.0" }, "Server listening");

    // ── Background jobs ──────────────────────────────────────────────────────

    const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
    function runCleanup(): void {
      cleanupTempFiles().catch((err: unknown) => {
        logger.error({ err }, "cleanupTempFiles: unhandled error — will retry next cycle");
      });
    }
    runCleanup();
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);

    const GMAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
    function scheduleGmailSync(): void {
      runGmailSync().catch((err: unknown) => {
        logger.error({ err }, "gmailSync: unhandled error — will retry next cycle");
      });
    }
    scheduleGmailSync();
    setInterval(scheduleGmailSync, GMAIL_SYNC_INTERVAL_MS);
  });
}

startup().catch((err: unknown) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
