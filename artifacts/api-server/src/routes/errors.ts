import { Router, type IRouter } from "express";
import * as zod from "zod";
import { db, errorsTable } from "@workspace/db";
import { optionalAuth, type PartialAuthRequest } from "../lib/auth";

const router: IRouter = Router();

const ErrorBody = zod.object({
  message: zod.string().min(1).max(2000),
  stack: zod.string().max(10000).optional(),
  pageUrl: zod.string().min(1).max(2000),
  userAgent: zod.string().max(500).optional(),
});

router.post("/errors", optionalAuth, async (req, res): Promise<void> => {
  const r = req as PartialAuthRequest;

  const parsed = ErrorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { message, stack, pageUrl, userAgent } = parsed.data;

  try {
    const [row] = await db
      .insert(errorsTable)
      .values({
        orgId: r.orgId ?? null,
        userId: r.userId ?? null,
        message,
        stack: stack ?? null,
        pageUrl,
        userAgent: userAgent ?? null,
      })
      .returning();

    res.status(201).json({ id: row.id });
  } catch (err) {
    req.log.error({ err }, "Failed to save error report");
    res.status(500).json({ error: "Failed to save error report" });
  }
});

export default router;
