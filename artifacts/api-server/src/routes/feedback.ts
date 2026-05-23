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

async function uploadToSupabase(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  const bucket = "feedback-screenshots";
  const path = `${Date.now()}-${filename}`;
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!res.ok) return null;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

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
      try {
        screenshotUrl = await uploadToSupabase(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
        );
      } catch (err) {
        req.log.warn({ err }, "Screenshot upload failed — saving feedback without screenshot");
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
