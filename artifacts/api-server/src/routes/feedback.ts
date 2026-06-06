import { Router, type IRouter } from "express";
import multer from "multer";
import * as zod from "zod";
import { db, feedbackTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  isCloudinaryConfigured,
  uploadFeedbackScreenshot,
  encodePublicId,
} from "../lib/cloudinaryClient";

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

    let screenshotUrl: string | null = null;

    if (req.file) {
      if (isCloudinaryConfigured()) {
        try {
          // Upload as private/authenticated — never publicly accessible.
          // Store the public_id prefixed with "cld:" so admin routes can
          // distinguish Cloudinary refs from legacy base64 data URIs.
          const publicId = await uploadFeedbackScreenshot(
            req.file.buffer,
            req.file.mimetype,
          );
          screenshotUrl = encodePublicId(publicId);
          req.log.info({ publicId }, "Feedback screenshot uploaded to Cloudinary");
        } catch (err) {
          // Fall back to base64 so the screenshot is never silently lost.
          req.log.warn({ err }, "Cloudinary upload failed — falling back to base64");
          screenshotUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
        }
      } else {
        // Cloudinary not configured — store inline as base64 data URI.
        req.log.warn("CLOUDINARY_* env vars not set — storing screenshot as base64 fallback");
        screenshotUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      }
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
