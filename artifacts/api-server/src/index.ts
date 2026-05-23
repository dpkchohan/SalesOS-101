import app from "./app";
import { logger } from "./lib/logger";
import { cleanupTempFiles } from "./jobs/cleanupTempFiles";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bind to 0.0.0.0 so the server is reachable in all deployment environments
// (Railway, Docker, Replit) and not just localhost.
app.listen(port, "0.0.0.0", () => {
  logger.info({ port, host: "0.0.0.0" }, "Server listening");

  // ── Background jobs ────────────────────────────────────────────────────────
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
