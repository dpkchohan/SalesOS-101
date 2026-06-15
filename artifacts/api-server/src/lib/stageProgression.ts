import { and, eq } from "drizzle-orm";
import { db, leadsTable, aiSignalsTable } from "@workspace/db";
import { claudeJson } from "./claude";

type LeadStage = "new" | "interested" | "qualified" | "negotiating" | "won" | "lost";
export type ProgressionTrigger = "email" | "interaction" | "document" | "proposal";

interface StageRule {
  fromStages: LeadStage[];
  toStage: LeadStage;
  keywords: string[];
  autoAdvance: boolean;
  needsConfirmation: boolean;
}

const STAGE_RULES: StageRule[] = [
  {
    fromStages: ["new"],
    toStage: "interested",
    keywords: [
      "interested",
      "demo",
      "learn more",
      "tell me more",
      "more info",
      "curious",
      "sounds good",
      "sounds interesting",
      "schedule a call",
      "let's talk",
      "follow up",
      "follow-up",
      "happy to chat",
      "would like to see",
      "want to know more",
    ],
    autoAdvance: true,
    needsConfirmation: false,
  },
  {
    fromStages: ["new", "interested"],
    toStage: "qualified",
    keywords: [
      "pricing",
      "price",
      "quote",
      "quotation",
      "budget",
      "how much",
      "cost",
      "rates",
      "packages",
      "proposal",
      "send me a proposal",
      "need a quote",
      "looking for pricing",
      "what do you charge",
      "fees",
    ],
    autoAdvance: true,
    needsConfirmation: true,
  },
  {
    fromStages: ["interested", "qualified"],
    toStage: "negotiating",
    keywords: [
      "proposal sent",
      "quote sent",
      "sent the proposal",
      "sent the quote",
      "offer",
      "contract",
      "agreement",
      "terms",
      "negotiate",
      "counter offer",
      "discount",
      "special price",
      "final price",
      "ready to proceed",
      "move forward",
      "next steps",
      "proceed with",
    ],
    autoAdvance: true,
    needsConfirmation: true,
  },
  {
    fromStages: ["new", "interested", "qualified", "negotiating"],
    toStage: "won",
    keywords: [
      "signed",
      "deal closed",
      "accepted",
      "confirmed",
      "purchase order",
      "po raised",
      "onboarding",
      "done deal",
      "going ahead",
      "let's proceed",
      "agreed to proceed",
      "invoice raised",
    ],
    autoAdvance: false,
    needsConfirmation: false,
  },
  {
    fromStages: ["new", "interested", "qualified", "negotiating"],
    toStage: "lost",
    keywords: [
      "not interested",
      "no longer interested",
      "going with another",
      "chose a competitor",
      "went with",
      "not moving forward",
      "cancel",
      "passed on this",
      "not a fit",
      "budget cut",
      "no budget",
      "decided against",
      "not proceeding",
      "dropping this",
    ],
    autoAdvance: false,
    needsConfirmation: false,
  },
];

const CONFIRM_SYSTEM = `You are a sales stage classifier. Analyze the text and decide if a lead should advance stages. Respond with strict JSON only: {"advance": true, "reason": "one sentence"} or {"advance": false, "reason": "one sentence"}`;

function findMatchingRule(currentStage: LeadStage, text: string): StageRule | null {
  const lower = text.toLowerCase();
  const advancingRules = STAGE_RULES.filter((r) => r.autoAdvance);
  const signalOnlyRules = STAGE_RULES.filter((r) => !r.autoAdvance);
  for (const rule of [...advancingRules, ...signalOnlyRules]) {
    if (!rule.fromStages.includes(currentStage)) continue;
    if (rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return rule;
  }
  return null;
}

async function confirmWithClaude(
  currentStage: string,
  toStage: string,
  text: string,
): Promise<boolean> {
  try {
    const result = await claudeJson<{ advance: boolean; reason: string }>(
      CONFIRM_SYSTEM,
      `Should a lead at stage "${currentStage}" advance to "${toStage}" based on this text?\nText: "${text.slice(0, 400)}"`,
    );
    return result.advance === true;
  } catch {
    return false;
  }
}

export async function checkAndAdvanceStage(args: {
  orgId: string;
  leadId: string;
  text: string;
  triggerType: ProgressionTrigger;
}): Promise<void> {
  const { orgId, leadId, text, triggerType } = args;
  if (!text?.trim()) return;

  const [lead] = await db
    .select({ id: leadsTable.id, stage: leadsTable.stage })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.orgId, orgId)))
    .limit(1);

  if (!lead) return;

  const currentStage = lead.stage as LeadStage;
  if (currentStage === "won" || currentStage === "lost") return;

  const rule = findMatchingRule(currentStage, text);
  if (!rule) return;

  if (!rule.autoAdvance) {
    await db.insert(aiSignalsTable).values({
      orgId,
      leadId,
      signalType: "stage_suggestion",
      severity: "medium",
      message: `${triggerType === "email" ? "Email" : "Activity"} suggests this lead may be at "${rule.toStage}" stage.`,
      recommendation: `Review and consider advancing to "${rule.toStage}".`,
    });
    return;
  }

  let shouldAdvance = true;
  if (rule.needsConfirmation) {
    shouldAdvance = await confirmWithClaude(currentStage, rule.toStage, text);
  }

  if (shouldAdvance) {
    await db
      .update(leadsTable)
      .set({ stage: rule.toStage, updatedAt: new Date() })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.orgId, orgId)));

    await db.insert(aiSignalsTable).values({
      orgId,
      leadId,
      signalType: "stage_advanced",
      severity: "low",
      message: `Stage auto-advanced from "${currentStage}" → "${rule.toStage}" via ${triggerType}.`,
      recommendation: `Follow up to maintain momentum at the "${rule.toStage}" stage.`,
    });
  } else {
    await db.insert(aiSignalsTable).values({
      orgId,
      leadId,
      signalType: "stage_suggestion",
      severity: "low",
      message: `Keywords suggest "${rule.toStage}" but confidence was low. Current: "${currentStage}".`,
      recommendation: `Review the ${triggerType} and consider advancing to "${rule.toStage}" if appropriate.`,
    });
  }
}
