import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  documentsTable,
  leadsTable,
  contactsTable,
  companiesTable,
  interactionsTable,
  companyCredentialsTable,
} from "@workspace/db";
import {
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  ListDocumentsResponseItem,
  CreateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentBody,
  UpdateDocumentResponse,
  GetDocumentParams,
  GetDocumentResponse,
  GenerateProposalBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { generateProposalHtml } from "../lib/proposalGen";

const router: IRouter = Router();

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListDocumentsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  try {
    const conditions = [eq(documentsTable.orgId, r.orgId)];
    if (q.data.leadId) conditions.push(eq(documentsTable.leadId, q.data.leadId));
    const rows = await db
      .select()
      .from(documentsTable)
      .where(and(...conditions))
      .orderBy(desc(documentsTable.createdAt));
    res.json(ListDocumentsResponse.parse(rows));
  } catch (err) {
    req.log.error({ err }, "Failed to list documents");
    res.status(500).json({ error: "Failed to list documents" });
  }
});

router.post("/documents", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateDocumentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
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
    res.status(201).json(ListDocumentsResponseItem.parse(row));
  } catch (err) {
    req.log.error({ err }, "Failed to create document");
    res.status(500).json({ error: "Failed to create document" });
  }
});

router.post("/documents/generate-proposal", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = GenerateProposalBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [leadRow] = await db
    .select({
      lead: leadsTable,
      contact: contactsTable,
      company: companiesTable,
    })
    .from(leadsTable)
    .leftJoin(
      contactsTable,
      and(eq(leadsTable.contactId, contactsTable.id), eq(contactsTable.orgId, r.orgId)),
    )
    .leftJoin(
      companiesTable,
      and(eq(contactsTable.companyId, companiesTable.id), eq(companiesTable.orgId, r.orgId)),
    )
    .where(and(eq(leadsTable.id, body.data.leadId), eq(leadsTable.orgId, r.orgId)));

  if (!leadRow || !leadRow.contact) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const interactions = await db
    .select()
    .from(interactionsTable)
    .where(and(eq(interactionsTable.leadId, leadRow.lead.id), eq(interactionsTable.orgId, r.orgId)))
    .orderBy(desc(interactionsTable.date), desc(interactionsTable.createdAt))
    .limit(15);

  const [creds] = await db
    .select()
    .from(companyCredentialsTable)
    .where(eq(companyCredentialsTable.orgId, r.orgId))
    .limit(1);

  let html: string;
  try {
    html = await generateProposalHtml({
      branding: creds ?? null,
      contact: leadRow.contact,
      company: leadRow.company,
      lead: leadRow.lead,
      interactions,
      extraContext: body.data.context ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Proposal generation failed");
    res.status(500).json({ error: "Failed to generate proposal" });
    return;
  }

  const title = `Proposal — ${leadRow.contact.name}${
    leadRow.company ? ` (${leadRow.company.name})` : ""
  }`;

  const [row] = await db
    .insert(documentsTable)
    .values({
      orgId: r.orgId,
      leadId: leadRow.lead.id,
      type: "proposal",
      title,
      content: html,
      format: "html",
      status: "draft",
    })
    .returning();

  res.status(201).json(row);
});

router.get("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(documentsTable)
    .where(and(eq(documentsTable.id, params.data.id), eq(documentsTable.orgId, r.orgId)));
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(GetDocumentResponse.parse(row));
});

router.put("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateDocumentParams.safeParse(req.params);
  const body = UpdateDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
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
  } catch (err) {
    req.log.error({ err }, "Failed to update document");
    res.status(500).json({ error: "Failed to update document" });
  }
});

export default router;
