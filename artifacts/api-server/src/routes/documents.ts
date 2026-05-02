import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, documentsTable, leadsTable } from "@workspace/db";
import {
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  CreateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentBody,
  UpdateDocumentResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListDocumentsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const conditions = [eq(documentsTable.orgId, r.orgId)];
  if (q.data.leadId) conditions.push(eq(documentsTable.leadId, q.data.leadId));
  const rows = await db
    .select()
    .from(documentsTable)
    .where(and(...conditions))
    .orderBy(desc(documentsTable.createdAt));
  res.json(ListDocumentsResponse.parse(rows));
});

router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, body.data.leadId), eq(leadsTable.orgId, r.orgId)));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  const [row] = await db
    .insert(documentsTable)
    .values({ ...body.data, orgId: r.orgId })
    .returning();
  res.status(201).json(row);
});

router.put("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateDocumentParams.safeParse(req.params);
  const body = UpdateDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const update: Record<string, unknown> = { ...body.data };
  if (body.data.status === "sent") update.sentAt = new Date();
  const [row] = await db
    .update(documentsTable)
    .set(update)
    .where(and(eq(documentsTable.id, params.data.id), eq(documentsTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(UpdateDocumentResponse.parse(row));
});

export default router;
