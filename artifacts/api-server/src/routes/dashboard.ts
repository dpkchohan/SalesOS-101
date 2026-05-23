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
import type { z } from "zod";

type DashboardSummary = z.infer<typeof GetDashboardSummaryResponse>;

const router: IRouter = Router();

const STAGES = ["new", "interested", "qualified", "negotiating", "won", "lost"] as const;
const VALID_SENTIMENTS = new Set(["positive", "neutral", "negative"]);
const VALID_SEVERITIES = new Set(["high", "medium", "low"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);
const VALID_INTERACTION_TYPES = new Set(["call", "email", "meeting", "note"]);

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;

  // ── Pipeline ────────────────────────────────────────────────────────────────
  let pipeline = STAGES.map((stage) => ({ stage, count: 0, totalValue: 0 }));
  let totalPipelineValue = 0;
  try {
    const stageRows = await db
      .select({
        stage: leadsTable.stage,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${leadsTable.valueUsd}), 0)::int`,
      })
      .from(leadsTable)
      .where(eq(leadsTable.orgId, r.orgId))
      .groupBy(leadsTable.stage);

    const stageMap = new Map(
      stageRows.map((s) => [s.stage, { count: s.count ?? 0, totalValue: s.totalValue ?? 0 }]),
    );
    pipeline = STAGES.map((stage) => ({
      stage,
      count: stageMap.get(stage)?.count ?? 0,
      totalValue: stageMap.get(stage)?.totalValue ?? 0,
    }));
    totalPipelineValue = pipeline
      .filter((p) => p.stage !== "won" && p.stage !== "lost")
      .reduce((sum, p) => sum + p.totalValue, 0);
  } catch (err) {
    req.log.error({ err }, "dashboard: failed to load pipeline — returning zeros");
  }

  // ── Today's tasks ────────────────────────────────────────────────────────────
  let todaysTasks: unknown[] = [];
  try {
    const rows = await db
      .select({
        id: tasksTable.id,
        leadId: tasksTable.leadId,
        leadContactName: contactsTable.name,
        assignedTo: tasksTable.assignedTo,
        title: tasksTable.title,
        description: tasksTable.description,
        dueDate: tasksTable.dueDate,
        dueTime: tasksTable.dueTime,
        completedAt: tasksTable.completedAt,
        priority: tasksTable.priority,
        calendarEventId: tasksTable.calendarEventId,
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

    todaysTasks = rows.map((t) => ({
      ...t,
      priority: VALID_PRIORITIES.has(t.priority ?? "") ? (t.priority as "high" | "medium" | "low") : "medium",
    }));
  } catch (err) {
    req.log.error({ err }, "dashboard: failed to load today's tasks — returning empty");
  }

  // ── AI signals ───────────────────────────────────────────────────────────────
  let activeSignals: unknown[] = [];
  try {
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
      .where(eq(aiSignalsTable.orgId, r.orgId))
      .orderBy(desc(aiSignalsTable.createdAt))
      .limit(10);

    activeSignals = rows
      .filter((s) => VALID_SEVERITIES.has(s.severity ?? ""))
      .map((s) => ({
        ...s,
        severity: s.severity as "high" | "medium" | "low",
      }));
  } catch (err) {
    req.log.error({ err }, "dashboard: failed to load AI signals — returning empty");
  }

  // ── Recent interactions ──────────────────────────────────────────────────────
  let recentInteractions: unknown[] = [];
  try {
    const rows = await db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.orgId, r.orgId))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(5);

    recentInteractions = rows
      .filter((i) => VALID_INTERACTION_TYPES.has(i.type ?? ""))
      .map((i) => ({
        ...i,
        type: i.type as "call" | "email" | "meeting" | "note",
        gains: Array.isArray(i.gains) ? i.gains : [],
        misses: Array.isArray(i.misses) ? i.misses : [],
        actionItems: Array.isArray(i.actionItems) ? i.actionItems : [],
        sentiment: VALID_SENTIMENTS.has(i.sentiment ?? "")
          ? (i.sentiment as "positive" | "neutral" | "negative")
          : null,
      }));
  } catch (err) {
    req.log.error({ err }, "dashboard: failed to load recent interactions — returning empty");
  }

  // ── Serialize ────────────────────────────────────────────────────────────────
  const payload = { pipeline, totalPipelineValue, todaysTasks, activeSignals, recentInteractions };

  const parsed = GetDashboardSummaryResponse.safeParse(payload);
  if (!parsed.success) {
    req.log.error({ issues: parsed.error.issues }, "dashboard: Zod validation failed — returning raw payload");
    res.json(payload);
    return;
  }

  res.json(parsed.data);
});

export default router;
