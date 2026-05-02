import { Router, type IRouter } from "express";
import { and, eq, or, ilike, sql, desc, inArray } from "drizzle-orm";
import {
  db,
  contactsTable,
  companiesTable,
  leadsTable,
  interactionsTable,
} from "@workspace/db";
import {
  ListContactsQueryParams,
  ListContactsResponse,
  CreateContactBody,
  GetContactParams,
  GetContactResponse,
  UpdateContactParams,
  UpdateContactBody,
  UpdateContactResponse,
  DeleteContactParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/contacts", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListContactsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const { search, companyId, page, limit } = q.data;
  const conditions = [eq(contactsTable.orgId, r.orgId)];
  if (companyId) conditions.push(eq(contactsTable.companyId, companyId));
  if (search) {
    const s = `%${search}%`;
    conditions.push(
      or(
        ilike(contactsTable.name, s),
        ilike(contactsTable.email, s),
        ilike(contactsTable.title, s),
      )!,
    );
  }
  const where = and(...conditions);

  const totalRow = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactsTable)
    .where(where);
  const total = totalRow[0]?.count ?? 0;

  const rows = await db
    .select({
      id: contactsTable.id,
      companyId: contactsTable.companyId,
      companyName: companiesTable.name,
      name: contactsTable.name,
      email: contactsTable.email,
      phone: contactsTable.phone,
      title: contactsTable.title,
      tags: contactsTable.tags,
      createdAt: contactsTable.createdAt,
      updatedAt: contactsTable.updatedAt,
    })
    .from(contactsTable)
    .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
    .where(where)
    .orderBy(desc(contactsTable.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  res.json(ListContactsResponse.parse({ data: rows, total, page, limit }));
});

router.post("/contacts", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateContactBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { tags, ...rest } = body.data;
  const [row] = await db
    .insert(contactsTable)
    .values({ ...rest, tags: tags ?? [], orgId: r.orgId })
    .returning();
  res.status(201).json(UpdateContactResponse.parse(row));
});

router.get("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)));
  if (!row) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  let company = null;
  if (row.companyId) {
    const [c] = await db.select().from(companiesTable).where(eq(companiesTable.id, row.companyId));
    company = c ?? null;
  }
  const leads = await db.select().from(leadsTable).where(eq(leadsTable.contactId, row.id));
  const leadIds: string[] = leads.map((l: { id: string }) => l.id);
  let interactions: (typeof interactionsTable.$inferSelect)[] = [];
  if (leadIds.length > 0) {
    interactions = await db
      .select()
      .from(interactionsTable)
      .where(
        and(eq(interactionsTable.orgId, r.orgId), inArray(interactionsTable.leadId, leadIds)),
      )
      .orderBy(desc(interactionsTable.createdAt))
      .limit(20);
  }
  res.json(GetContactResponse.parse({ ...row, company, leads, interactions }));
});

router.put("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateContactParams.safeParse(req.params);
  const body = UpdateContactBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { tags, ...rest } = body.data;
  const [row] = await db
    .update(contactsTable)
    .set({ ...rest, ...(tags !== undefined ? { tags } : {}) })
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.json(UpdateContactResponse.parse(row));
});

router.delete("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(contactsTable)
    .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
