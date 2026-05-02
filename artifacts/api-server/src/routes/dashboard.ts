import { Router, type IRouter } from "express";
import { and, eq, sql, desc, isNull } from "drizzle-orm";
import {
  db,
  leadsTable,
  tasksTable,
  contactsTable,
  aiSignalsTable,
  interactionsTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const STAGES = ["new", "interested", "qualified", "negotiating", "won", "lost"] as const;

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;

  const stageRows = await db
    .select({
      stage: leadsTable.stage,
      count: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${leadsTable.valueUsd}), 0)::int`,
    })
    .from(leadsTable)
    .where(eq(leadsTable.orgId, r.orgId))
    .groupBy(leadsTable.stage);
  const stageMap = new Map<string, { count: number; totalValue: number }>(
    stageRows.map((s) => [s.stage, { count: s.count, totalValue: s.totalValue }]),
  );
  const pipeline = STAGES.map((stage) => ({
    stage,
    count: stageMap.get(stage)?.count ?? 0,
    totalValue: stageMap.get(stage)?.totalValue ?? 0,
  }));
  const totalPipelineValue = pipeline
    .filter((p) => p.stage !== "won" && p.stage !== "lost")
    .reduce((sum, p) => sum + p.totalValue, 0);

  const todaysTasksRaw = await db
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
    .where(
      and(
        eq(tasksTable.orgId, r.orgId),
        isNull(tasksTable.completedAt),
        sql`(${tasksTable.dueDate} <= CURRENT_DATE OR ${tasksTable.dueDate} IS NULL)`,
      ),
    )
    .orderBy(tasksTable.dueDate)
    .limit(20);

  const activeSignals = await db
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
    .where(eq(aiSignalsTable.orgId, r.orgId))
    .orderBy(desc(aiSignalsTable.createdAt))
    .limit(10);

  const recentInteractions = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.orgId, r.orgId))
    .orderBy(desc(interactionsTable.createdAt))
    .limit(5);

  res.json(
    GetDashboardSummaryResponse.parse({
      pipeline,
      totalPipelineValue,
      todaysTasks: todaysTasksRaw,
      activeSignals,
      recentInteractions,
    }),
  );
});

export default router;
