import { Router, type IRouter } from "express";
import multer from "multer";
import * as zod from "zod";
import { db, feedbackTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are accepted for screenshots"));
  },
});

const FeedbackBody = zod.object({
  type: zod.enum(["bug", "feature", "feedback"]),
  criticality: zod.coerce.number().int().min(1).max(5),
  description: zod.string().min(1).max(5000),
  pageUrl: zod.string().url().or(zod.string().min(1)),
});

router.post(
  "/feedback",
  requireAuth,
  upload.single("screenshot"),
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;

    const parsed = FeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { type, criticality, description, pageUrl } = parsed.data;

    // Store screenshot as a base64 data URI directly in the DB.
    // This requires no external storage services and never silently drops images.
    let screenshotUrl: string | null = null;
    if (req.file) {
      screenshotUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    }

    try {
      const [row] = await db
        .insert(feedbackTable)
        .values({
          orgId: r.orgId,
          userId: r.userId,
          type,
          criticality,
          description,
          screenshotUrl,
          pageUrl,
          status: "open",
        })
        .returning();

      res.status(201).json({ id: row.id, status: row.status });
    } catch (err) {
      req.log.error({ err }, "Failed to save feedback");
      res.status(500).json({ error: "Failed to save feedback" });
    }
  },
);

export default router;
