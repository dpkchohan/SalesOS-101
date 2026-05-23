import { Router, type IRouter } from "express";
import * as zod from "zod";
import {
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteFile,
  getStorageUsage,
  checkQuota,
  updateStorageUsage,
  type StorageFolder,
} from "../lib/storage";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const VALID_FOLDERS = new Set<StorageFolder>([
  "temp/imports",
  "temp/extractions",
  "documents/contacts",
  "documents/deals",
  "feedback",
]);

const UploadBody = zod.object({
  filename: zod.string().min(1).max(500),
  contentType: zod.string().min(1).max(200),
  fileSize: zod.number().int().positive(),
  folder: zod.string(),
});

// ── POST /storage/upload ──────────────────────────────────────────────────────
router.post("/storage/upload", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;

  const parsed = UploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { filename, contentType, fileSize, folder } = parsed.data;

  if (!VALID_FOLDERS.has(folder as StorageFolder)) {
    res.status(400).json({
      error: `Invalid folder. Must be one of: ${[...VALID_FOLDERS].join(", ")}`,
    });
    return;
  }

  try {
    await checkQuota(r.userId, r.orgId, fileSize);
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode ?? 500).json({ error: e.message });
    return;
  }

  try {
    const result = await getPresignedUploadUrl(
      r.userId,
      r.orgId,
      filename,
      contentType,
      folder as StorageFolder,
    );
    await updateStorageUsage(r.userId, r.orgId, fileSize);
    res.status(200).json(result);
  } catch (err) {
    req.log.error({ err }, "storage: failed to generate upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ── GET /storage/usage ────────────────────────────────────────────────────────
router.get("/storage/usage", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const { usedBytes, quotaBytes, tier } = await getStorageUsage(r.userId, r.orgId);
    res.json({
      tier,
      usedBytes,
      quotaBytes,
      usedMB: +(usedBytes / 1_048_576).toFixed(2),
      quotaMB: +(quotaBytes / 1_048_576).toFixed(2),
      percentUsed:
        quotaBytes > 0 ? +((usedBytes / quotaBytes) * 100).toFixed(1) : 0,
    });
  } catch (err) {
    req.log.error({ err }, "storage: failed to get usage");
    res.status(500).json({ error: "Failed to get storage usage" });
  }
});

// ── GET /storage/download/* ───────────────────────────────────────────────────
// router.use() captures the full sub-path (including slashes) in req.path,
// avoiding Express 5 / path-to-regexp v8 wildcard restrictions.
router.use(
  "/storage/download",
  requireAuth,
  async (req, res, next): Promise<void> => {
    if (req.method !== "GET") {
      next();
      return;
    }

    const key = req.path.replace(/^\//, "");
    if (!key) {
      res.status(400).json({ error: "Missing file key" });
      return;
    }

    const r = req as AuthenticatedRequest;
    try {
      const result = await getPresignedDownloadUrl(r.userId, r.orgId, key);
      res.json(result);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 403) {
        res.status(403).json({ error: e.message });
      } else {
        req.log.error({ err }, "storage: failed to generate download URL");
        res.status(500).json({ error: "Failed to generate download URL" });
      }
    }
  },
);

// ── DELETE /storage/file/* ────────────────────────────────────────────────────
router.use(
  "/storage/file",
  requireAuth,
  async (req, res, next): Promise<void> => {
    if (req.method !== "DELETE") {
      next();
      return;
    }

    const key = req.path.replace(/^\//, "");
    if (!key) {
      res.status(400).json({ error: "Missing file key" });
      return;
    }

    const r = req as AuthenticatedRequest;
    try {
      const fileSize = parseInt((req.query.fileSize as string) ?? "0", 10) || 0;

      await deleteFile(r.userId, r.orgId, key);

      if (fileSize > 0) {
        await updateStorageUsage(r.userId, r.orgId, -fileSize);
      }

      res.json({ success: true });
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 403) {
        res.status(403).json({ error: e.message });
      } else {
        req.log.error({ err }, "storage: failed to delete file");
        res.status(500).json({ error: "Failed to delete file" });
      }
    }
  },
);

export default router;
