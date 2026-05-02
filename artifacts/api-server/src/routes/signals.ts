import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, aiSignalsTable, contactsTable, leadsTable } from "@workspace/db";
import { ListSignalsQueryParams, ListSignalsResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/signals", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListSignalsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const conditions = [eq(aiSignalsTable.orgId, r.orgId)];
  if (q.data.leadId) conditions.push(eq(aiSignalsTable.leadId, q.data.leadId));
  const rows = await db
    .select({
      id: aiSignalsTable.id,
      leadId: aiSignalsTable.leadId,
      leadContactName: contactsTable.name,
      signalType: aiSignalsTable.signalType,
      severity: aiSignalsTable.severity,
      message: aiSignalsTable.message,
      recommendation: aiSignalsTable.recommendation,
      createdAt: aiSignalsTable.createdAt,
    })
    .from(aiSignalsTable)
    .leftJoin(leadsTable, eq(aiSignalsTable.leadId, leadsTable.id))
    .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
    .where(and(...conditions))
    .orderBy(desc(aiSignalsTable.createdAt));
  res.json(ListSignalsResponse.parse(rows));
});

export default router;
