import { and, eq, desc } from "drizzle-orm";
import {
  db,
  leadsTable,
  contactsTable,
  interactionsTable,
  aiSignalsTable,
  tasksTable,
} from "@workspace/db";
import { claudeJson } from "./claude";

interface SignalDraft {
  signalType: string;
  severity: "high" | "medium" | "low";
  message: string;
  recommendation?: string | null;
}

const SYSTEM = `You are an expert B2B sales coach analyzing a sales lead for red flags. Detect 0-5 issues that hurt the chance of closing this deal. Examples of red flags:
- "no_recent_contact": no interaction in the last 14 days
- "stalled_in_stage": lead has been in the same stage for 30+ days
- "negative_sentiment": last interaction sentiment was negative
- "missing_action_items": prior interaction had action items but no follow-up
- "no_decision_maker": no contact identified as decision maker
- "value_at_risk": large deal close date approaching with low engagement

Respond with a strict JSON array. Each item: { "signalType": string, "severity": "high"|"medium"|"low", "message": one sentence, "recommendation": one actionable next step }.
If there are no red flags, return [].
Do not include any prose outside the JSON.`;

export async function analyzeLeadForRedFlags(args: {
  leadId: string;
  orgId: string;
}): Promise<SignalDraft[] & { saved?: boolean }> {
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, args.leadId), eq(leadsTable.orgId, args.orgId)));
  if (!row) throw new Error("Lead not found");

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, row.contactId));
  const interactions = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.leadId, row.id))
    .orderBy(desc(interactionsTable.date))
    .limit(10);
  const tasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.leadId, row.id))
    .limit(20);

  const ctx = {
    lead: {
      stage: row.stage,
      valueUsd: row.valueUsd,
      currency: row.currency,
      closeDate: row.closeDate,
      source: row.source,
      stageEnteredApprox: row.updatedAt,
      createdAt: row.createdAt,
    },
    contact: contact
      ? { name: contact.name, title: contact.title, email: contact.email }
      : null,
    interactions: interactions.map((i: typeof interactionsTable.$inferSelect) => ({
      type: i.type,
      date: i.date,
      gist: i.gist,
      gains: i.gains,
      misses: i.misses,
      actionItems: i.actionItems,
      nextStep: i.nextStep,
      sentiment: i.sentiment,
    })),
    openTasks: tasks
      .filter((t: typeof tasksTable.$inferSelect) => !t.completedAt)
      .map((t: typeof tasksTable.$inferSelect) => ({
        title: t.title,
        dueDate: t.dueDate,
        priority: t.priority,
      })),
    today: new Date().toISOString().slice(0, 10),
  };

  const drafts = await claudeJson<SignalDraft[]>(
    SYSTEM,
    `Analyze this lead and return red-flag signals as JSON.\n\n${JSON.stringify(ctx, null, 2)}`,
  );

  // Replace previous signals for this lead
  await db.delete(aiSignalsTable).where(eq(aiSignalsTable.leadId, row.id));
  if (drafts.length === 0) return [];

  const inserted = await db
    .insert(aiSignalsTable)
    .values(
      drafts.map((d) => ({
        orgId: args.orgId,
        leadId: row.id,
        signalType: d.signalType,
        severity: d.severity,
        message: d.message,
        recommendation: d.recommendation ?? null,
      })),
    )
    .returning();
  return inserted as unknown as SignalDraft[] & { saved?: boolean };
}
