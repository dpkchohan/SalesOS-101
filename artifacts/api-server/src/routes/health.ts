import { Router, type IRouter } from "express";
import { getMigrationStatus } from "../lib/migrationCheck";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const migrations = getMigrationStatus();

  // If migrations are pending, signal degraded status so load-balancers
  // (ELB, Railway, Coolify) can detect and alert on the condition.
  const migrationsPending = migrations !== null && !migrations.ok;
  const statusCode = migrationsPending ? 503 : 200;

  res.status(statusCode).json({
    status: migrationsPending ? "degraded" : "ok",
    migrations: migrations ?? { ok: null, note: "check not yet complete" },
  });
});

export default router;
