import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { checkCalendarConnection } from "../lib/gcal";

const router: IRouter = Router();

router.get("/integrations/calendar-status", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const status = await checkCalendarConnection(r.userId);
    res.json(status);
  } catch (err) {
    req.log.error({ err }, "Failed to check calendar status");
    res.json({ connected: false, email: null, error: "check_failed" });
  }
});

export default router;
