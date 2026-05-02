import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, interactionsTable, leadsTable } from "@workspace/db";
import {
  ListInteractionsQueryParams,
  ListInteractionsResponse,
  CreateInteractionBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

function toIsoDate(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

router.get("/interactions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListInteractionsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(interactionsTable)
    .where(
      and(
        eq(interactionsTable.orgId, r.orgId),
        eq(interactionsTable.leadId, q.data.leadId),
      ),
    )
    .orderBy(desc(interactionsTable.date), desc(interactionsTable.createdAt));
  res.json(ListInteractionsResponse.parse(rows));
});

router.post("/interactions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateInteractionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // Verify lead belongs to org
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, body.data.leadId), eq(leadsTable.orgId, r.orgId)));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const { date, gains, misses, actionItems, ...rest } = body.data;
  const [row] = await db
    .insert(interactionsTable)
    .values({
      ...rest,
      orgId: r.orgId,
      createdBy: r.userId,
      date: toIsoDate(date),
      gains: gains ?? [],
      misses: misses ?? [],
      actionItems: (actionItems ?? []).map((a) => ({
        title: a.title,
        dueDate: a.dueDate ? toIsoDate(a.dueDate) : null,
      })),
    })
    .returning();
  res.status(201).json(row);
});

export default router;
