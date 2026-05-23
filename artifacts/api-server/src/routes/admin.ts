import { Router, type IRouter } from "express";
import * as zod from "zod";
import { and, eq, gte, lte, ilike, desc, sql } from "drizzle-orm";
import {
  db,
  feedbackTable,
  errorsTable,
  usersTable,
  organizationsTable,
} from "@workspace/db";
import { adminAuth } from "../middleware/adminAuth";

const router: IRouter = Router();

const PAGE_LIMIT = 50;

function parsePage(q: unknown): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(String(q ?? 1), 10) || 1);
  return { page, limit: PAGE_LIMIT, offset: (page - 1) * PAGE_LIMIT };
}

// ── GET /admin/feedback ───────────────────────────────────────────────────────
router.get("/admin/feedback", adminAuth, async (req, res): Promise<void> => {
  const { page, limit, offset } = parsePage(req.query.page);
  const { status, type, criticality, dateFrom, dateTo } = req.query;

  const conditions = [];
  if (status) conditions.push(eq(feedbackTable.status, String(status)));
  if (type) conditions.push(eq(feedbackTable.type, String(type)));
  if (criticality) conditions.push(eq(feedbackTable.criticality, Number(criticality)));
  if (dateFrom) conditions.push(gte(feedbackTable.createdAt, new Date(String(dateFrom))));
  if (dateTo) conditions.push(lte(feedbackTable.createdAt, new Date(String(dateTo))));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: feedbackTable.id,
          type: feedbackTable.type,
          criticality: feedbackTable.criticality,
          description: feedbackTable.description,
          screenshotUrl: feedbackTable.screenshotUrl,
          pageUrl: feedbackTable.pageUrl,
          status: feedbackTable.status,
          createdAt: feedbackTable.createdAt,
          userEmail: usersTable.email,
          userName: usersTable.name,
          orgName: organizationsTable.name,
        })
        .from(feedbackTable)
        .innerJoin(usersTable, eq(feedbackTable.userId, usersTable.id))
        .innerJoin(organizationsTable, eq(feedbackTable.orgId, organizationsTable.id))
        .where(where)
        .orderBy(desc(feedbackTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(feedbackTable)
        .where(where),
    ]);
    res.json({ rows, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "admin: failed to list feedback");
    res.status(500).json({ error: "Failed to list feedback" });
  }
});

// ── PATCH /admin/feedback/:id ─────────────────────────────────────────────────
const FeedbackStatusBody = zod.object({
  status: zod.enum(["open", "reviewed", "resolved"]),
});

router.patch("/admin/feedback/:id", adminAuth, async (req, res): Promise<void> => {
  const parsed = FeedbackStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [updated] = await db
      .update(feedbackTable)
      .set({ status: parsed.data.status })
      .where(eq(feedbackTable.id, req.params.id))
      .returning({ id: feedbackTable.id, status: feedbackTable.status });
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "admin: failed to update feedback");
    res.status(500).json({ error: "Failed to update feedback" });
  }
});

// ── DELETE /admin/feedback/:id ────────────────────────────────────────────────
router.delete("/admin/feedback/:id", adminAuth, async (req, res): Promise<void> => {
  try {
    await db.delete(feedbackTable).where(eq(feedbackTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin: failed to delete feedback");
    res.status(500).json({ error: "Failed to delete feedback" });
  }
});

// ── GET /admin/errors ─────────────────────────────────────────────────────────
router.get("/admin/errors", adminAuth, async (req, res): Promise<void> => {
  const { page, limit, offset } = parsePage(req.query.page);
  const { status, pageUrl, dateFrom, dateTo } = req.query;

  const conditions = [];
  if (status) conditions.push(eq(errorsTable.status, String(status)));
  if (pageUrl) conditions.push(ilike(errorsTable.pageUrl, `%${String(pageUrl)}%`));
  if (dateFrom) conditions.push(gte(errorsTable.createdAt, new Date(String(dateFrom))));
  if (dateTo) conditions.push(lte(errorsTable.createdAt, new Date(String(dateTo))));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: errorsTable.id,
          message: errorsTable.message,
          stack: errorsTable.stack,
          pageUrl: errorsTable.pageUrl,
          userAgent: errorsTable.userAgent,
          status: errorsTable.status,
          createdAt: errorsTable.createdAt,
          userEmail: usersTable.email,
          orgName: organizationsTable.name,
        })
        .from(errorsTable)
        .leftJoin(usersTable, eq(errorsTable.userId, usersTable.id))
        .leftJoin(organizationsTable, eq(errorsTable.orgId, organizationsTable.id))
        .where(where)
        .orderBy(desc(errorsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(errorsTable)
        .where(where),
    ]);
    res.json({ rows, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "admin: failed to list errors");
    res.status(500).json({ error: "Failed to list errors" });
  }
});

// ── PATCH /admin/errors/:id ───────────────────────────────────────────────────
const ErrorStatusBody = zod.object({
  status: zod.enum(["new", "investigated", "fixed", "ignored"]),
});

router.patch("/admin/errors/:id", adminAuth, async (req, res): Promise<void> => {
  const parsed = ErrorStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [updated] = await db
      .update(errorsTable)
      .set({ status: parsed.data.status })
      .where(eq(errorsTable.id, req.params.id))
      .returning({ id: errorsTable.id, status: errorsTable.status });
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "admin: failed to update error");
    res.status(500).json({ error: "Failed to update error" });
  }
});

// ── DELETE /admin/errors/:id ──────────────────────────────────────────────────
router.delete("/admin/errors/:id", adminAuth, async (req, res): Promise<void> => {
  try {
    await db.delete(errorsTable).where(eq(errorsTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "admin: failed to delete error");
    res.status(500).json({ error: "Failed to delete error" });
  }
});

export default router;
