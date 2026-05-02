import { Router, type IRouter } from "express";
import { and, eq, desc, isNull, sql } from "drizzle-orm";
import { db, tasksTable, contactsTable, leadsTable } from "@workspace/db";
import {
  ListTasksQueryParams,
  ListTasksResponse,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  UpdateTaskResponse,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

function toIsoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString().slice(0, 10);
}

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListTasksQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const conditions = [eq(tasksTable.orgId, r.orgId)];
  if (q.data.leadId) conditions.push(eq(tasksTable.leadId, q.data.leadId));
  if (q.data.dueToday) {
    conditions.push(sql`${tasksTable.dueDate} = CURRENT_DATE`);
  } else if (q.data.dueDate) {
    conditions.push(eq(tasksTable.dueDate, toIsoDate(q.data.dueDate)!));
  }
  if (!q.data.includeCompleted) conditions.push(isNull(tasksTable.completedAt));

  const rows = await db
    .select({
      id: tasksTable.id,
      leadId: tasksTable.leadId,
      leadContactName: contactsTable.name,
      assignedTo: tasksTable.assignedTo,
      title: tasksTable.title,
      description: tasksTable.description,
      dueDate: tasksTable.dueDate,
      completedAt: tasksTable.completedAt,
      priority: tasksTable.priority,
      createdAt: tasksTable.createdAt,
    })
    .from(tasksTable)
    .leftJoin(leadsTable, eq(tasksTable.leadId, leadsTable.id))
    .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
    .where(and(...conditions))
    .orderBy(tasksTable.dueDate, desc(tasksTable.createdAt));

  res.json(ListTasksResponse.parse(rows));
});

router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateTaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const { dueDate, ...rest } = body.data;
  const [row] = await db
    .insert(tasksTable)
    .values({
      ...rest,
      orgId: r.orgId,
      dueDate: toIsoDate(dueDate),
    })
    .returning();
  res.status(201).json({ ...row, leadContactName: null });
});

router.put("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateTaskParams.safeParse(req.params);
  const body = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { dueDate, completed, ...rest } = body.data;
  const update: Record<string, unknown> = { ...rest };
  if (dueDate !== undefined) update.dueDate = toIsoDate(dueDate);
  if (completed !== undefined) update.completedAt = completed ? new Date() : null;
  const [row] = await db
    .update(tasksTable)
    .set(update)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json(UpdateTaskResponse.parse(row));
});

router.delete("/tasks/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(tasksTable)
    .where(and(eq(tasksTable.id, params.data.id), eq(tasksTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
