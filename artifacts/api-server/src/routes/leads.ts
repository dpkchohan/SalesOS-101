import { Router, type IRouter } from "express";
import { and, eq, sql, desc, isNull, inArray } from "drizzle-orm";
import {
  db,
  leadsTable,
  contactsTable,
  companiesTable,
  usersTable,
  interactionsTable,
  tasksTable,
  aiSignalsTable,
} from "@workspace/db";
import {
  ListLeadsQueryParams,
  ListLeadsResponse,
  CreateLeadBody,
  GetPipelineResponse,
  GetLeadParams,
  GetLeadResponse,
  UpdateLeadParams,
  UpdateLeadBody,
  UpdateLeadResponse,
  DeleteLeadParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { analyzeLeadForRedFlags } from "../lib/aiAnalyze";

const router: IRouter = Router();

const STAGES = ["new", "interested", "qualified", "negotiating", "won", "lost"] as const;

function toIsoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

async function listLeadsWithMeta(orgId: string, where: any) {
  const rows = await db
    .select({
      id: leadsTable.id,
      contactId: leadsTable.contactId,
      assignedTo: leadsTable.assignedTo,
      stage: leadsTable.stage,
      valueUsd: leadsTable.valueUsd,
      currency: leadsTable.currency,
      closeDate: leadsTable.closeDate,
      source: leadsTable.source,
      createdAt: leadsTable.createdAt,
      updatedAt: leadsTable.updatedAt,
      contactName: contactsTable.name,
      companyName: companiesTable.name,
      assigneeName: usersTable.name,
    })
    .from(leadsTable)
    .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
    .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
    .leftJoin(usersTable, eq(leadsTable.assignedTo, usersTable.id))
    .where(and(eq(leadsTable.orgId, orgId), where))
    .orderBy(desc(leadsTable.updatedAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({
      leadId: aiSignalsTable.leadId,
      count: sql<number>`count(*)::int`,
    })
    .from(aiSignalsTable)
    .where(inArray(aiSignalsTable.leadId, ids))
    .groupBy(aiSignalsTable.leadId);
  const countMap = new Map(counts.map((c) => [c.leadId, c.count]));

  return rows.map((r) => ({
    ...r,
    closeDate: toIsoDate(r.closeDate),
    contactName: r.contactName ?? "",
    companyName: r.companyName ?? null,
    assigneeName: r.assigneeName ?? null,
    openSignalCount: countMap.get(r.id) ?? 0,
  }));
}

router.get("/leads", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListLeadsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  try {
    const conditions = [];
    if (q.data.stage) conditions.push(eq(leadsTable.stage, q.data.stage));
    if (q.data.assignedTo) conditions.push(eq(leadsTable.assignedTo, q.data.assignedTo));
    const rows = await listLeadsWithMeta(
      r.orgId,
      and(...conditions, eq(leadsTable.orgId, r.orgId))!,
    );
    res.json(ListLeadsResponse.parse(rows));
  } catch (err) {
    req.log.error({ err }, "Failed to list leads");
    res.status(500).json({ error: "Failed to list leads" });
  }
});

router.post("/leads", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateLeadBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const { closeDate, ...rest } = body.data;
    const [contact] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, rest.contactId), eq(contactsTable.orgId, r.orgId)));
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    const [row] = await db
      .insert(leadsTable)
      .values({
        ...rest,
        closeDate: toIsoDate(closeDate),
        orgId: r.orgId,
      })
      .returning();
    res.status(201).json(UpdateLeadResponse.parse(row));
  } catch (err) {
    req.log.error({ err }, "Failed to create lead");
    res.status(500).json({ error: "Failed to create lead" });
  }
});

router.get("/leads/pipeline", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const all = await listLeadsWithMeta(r.orgId, eq(leadsTable.orgId, r.orgId));
    const columns = STAGES.map((stage) => {
      const leads = all.filter((l) => l.stage === stage);
      return {
        stage,
        count: leads.length,
        totalValue: leads.reduce((sum, l) => sum + (l.valueUsd ?? 0), 0),
        leads,
      };
    });
    res.json(GetPipelineResponse.parse({ columns }));
  } catch (err) {
    req.log.error({ err }, "Failed to load pipeline");
    res.status(500).json({ error: "Failed to load pipeline" });
  }
});

router.get("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [row] = await db
      .select({
        lead: leadsTable,
        contact: contactsTable,
        company: companiesTable,
        assigneeName: usersTable.name,
      })
      .from(leadsTable)
      .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .leftJoin(usersTable, eq(leadsTable.assignedTo, usersTable.id))
      .where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.orgId, r.orgId)));
    if (!row || !row.contact) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const interactions = await db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.leadId, row.lead.id))
      .orderBy(desc(interactionsTable.date), desc(interactionsTable.createdAt));
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.leadId, row.lead.id))
      .orderBy(tasksTable.dueDate);
    const signals = await db
      .select()
      .from(aiSignalsTable)
      .where(eq(aiSignalsTable.leadId, row.lead.id))
      .orderBy(desc(aiSignalsTable.createdAt));
    res.json(
      GetLeadResponse.parse({
        ...row.lead,
        closeDate: toIsoDate(row.lead.closeDate),
        assigneeName: row.assigneeName ?? null,
        contact: row.contact,
        company: row.company ?? null,
        interactions,
        tasks,
        signals,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get lead");
    res.status(500).json({ error: "Failed to get lead" });
  }
});

router.put("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateLeadParams.safeParse(req.params);
  const body = UpdateLeadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const { closeDate, ...rest } = body.data;
    const update: Record<string, unknown> = { ...rest };
    if (closeDate !== undefined) update.closeDate = toIsoDate(closeDate);
    const [row] = await db
      .update(leadsTable)
      .set(update)
      .where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.orgId, r.orgId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.json(UpdateLeadResponse.parse(row));
  } catch (err) {
    req.log.error({ err }, "Failed to update lead");
    res.status(500).json({ error: "Failed to update lead" });
  }
});

router.delete("/leads/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [row] = await db
      .delete(leadsTable)
      .where(and(eq(leadsTable.id, params.data.id), eq(leadsTable.orgId, r.orgId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err }, "Failed to delete lead");
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

router.post("/leads/:id/analyze", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const signals = await analyzeLeadForRedFlags({
      leadId: params.data.id,
      orgId: r.orgId,
    });
    res.json(signals);
  } catch (err) {
    req.log.error({ err }, "Failed to analyze lead");
    res.status(500).json({ error: "Failed to analyze lead" });
  }
});

// Suppress unused-import warning
void isNull;

export default router;
