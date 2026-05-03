import { Router, type IRouter } from "express";
import { and, eq, ilike, desc } from "drizzle-orm";
import {
  db,
  contactsTable,
  leadsTable,
  tasksTable,
  interactionsTable,
  documentsTable,
  companiesTable,
  companyCredentialsTable,
} from "@workspace/db";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { claudeJson } from "../lib/claude";
import { generateProposalHtml } from "../lib/proposalGen";
import { sendProposalEmail } from "../lib/gmail";

const router: IRouter = Router();

interface Intent {
  intent:
    | "create_task"
    | "log_interaction"
    | "create_contact"
    | "update_lead_stage"
    | "send_proposal"
    | "search"
    | "general";
  reply: string;
  // create_task
  task?: { title: string; dueDate?: string | null; priority?: "high" | "medium" | "low" };
  contactName?: string;
  // log_interaction
  interaction?: {
    type: "call" | "email" | "meeting" | "note";
    gist: string;
    gains?: string[];
    misses?: string[];
    nextStep?: string | null;
    sentiment?: "positive" | "neutral" | "negative" | null;
  };
  // create_contact
  contact?: { name: string; email?: string | null; phone?: string | null; title?: string | null };
  // update_lead_stage
  stage?: "new" | "interested" | "qualified" | "negotiating" | "won" | "lost";
  // send_proposal
  proposalContext?: string | null;
  sendEmail?: boolean;
}

const SYSTEM = `You are SalesOS, an in-app assistant for a sales rep. Parse the user's message into a structured intent. Always reply with strict JSON, no prose outside JSON.

Intents:
- "create_task": user wants a to-do. Example: "remind me to follow up with Acme tomorrow"
- "log_interaction": user wants to log a call/email/meeting/note. Example: "logged a call with John, he wants pricing by Friday"
- "create_contact": user wants to add a new contact. Example: "add new contact Sarah Lee at Globex, sarah@globex.com"
- "update_lead_stage": user wants to move a lead to a different stage. Stages: new, interested, qualified, negotiating, won, lost
- "send_proposal": user wants to generate a proposal. Example: "send John Smith a proposal about pricing and timeline" → contactName="John Smith", proposalContext="pricing and timeline". If the user explicitly asks to ALSO email it (e.g. "send AND email", "draft and email", "email it to them"), set sendEmail=true; otherwise omit sendEmail.
- "search": user is looking for info about a contact or lead
- "general": fallback for greetings and questions

Respond JSON shape:
{
  "intent": "...",
  "reply": "<one short, friendly confirmation or answer>",
  "task": { "title": "...", "dueDate": "YYYY-MM-DD or null", "priority": "low|medium|high" },
  "contactName": "<contact to attach the task/interaction/stage update to, if mentioned>",
  "interaction": { "type": "call|email|meeting|note", "gist": "...", "gains": [], "misses": [], "nextStep": "...", "sentiment": "positive|neutral|negative" },
  "contact": { "name": "...", "email": "...", "phone": "...", "title": "..." },
  "stage": "new|interested|qualified|negotiating|won|lost",
  "proposalContext": "<short summary of what the proposal should cover, if intent is send_proposal>",
  "sendEmail": false
}
Only include the fields relevant to the chosen intent.`;

async function findContactByName(orgId: string, name: string) {
  const [c] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.orgId, orgId), ilike(contactsTable.name, `%${name}%`)))
    .limit(1);
  return c ?? null;
}

async function findLeadForContact(orgId: string, contactId: string) {
  const [l] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.contactId, contactId)))
    .orderBy(desc(leadsTable.updatedAt))
    .limit(1);
  return l ?? null;
}

router.post("/chat", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = SendChatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  let intent: Intent;
  try {
    intent = await claudeJson<Intent>(
      SYSTEM,
      `Today is ${new Date().toISOString().slice(0, 10)}. Message: ${body.data.text}`,
    );
  } catch (err) {
    req.log.error({ err }, "Claude intent parse failed");
    res.json(
      SendChatResponse.parse({
        success: false,
        message: "Sorry, I couldn't understand that. Try again.",
        intent: "general",
      }),
    );
    return;
  }

  const reply = {
    success: true as boolean,
    message: intent.reply ?? "Done.",
    intent: intent.intent ?? "general",
    contactId: null as string | null,
    leadId: null as string | null,
    taskId: null as string | null,
    interactionId: null as string | null,
    documentId: null as string | null,
  };

  try {
    if (intent.intent === "create_contact" && intent.contact?.name) {
      const [c] = await db
        .insert(contactsTable)
        .values({
          orgId: r.orgId,
          name: intent.contact.name,
          email: intent.contact.email ?? null,
          phone: intent.contact.phone ?? null,
          title: intent.contact.title ?? null,
          tags: [],
        })
        .returning();
      reply.contactId = c.id;
    } else if (intent.intent === "create_task" && intent.task?.title) {
      let leadId: string | null = null;
      if (intent.contactName) {
        const c = await findContactByName(r.orgId, intent.contactName);
        if (c) {
          const l = await findLeadForContact(r.orgId, c.id);
          leadId = l?.id ?? null;
          reply.contactId = c.id;
        }
      }
      const [t] = await db
        .insert(tasksTable)
        .values({
          orgId: r.orgId,
          leadId,
          title: intent.task.title,
          dueDate: intent.task.dueDate ?? null,
          priority: intent.task.priority ?? "medium",
        })
        .returning();
      reply.taskId = t.id;
      reply.leadId = leadId;
    } else if (intent.intent === "log_interaction" && intent.interaction?.gist) {
      let leadId: string | null = null;
      if (intent.contactName) {
        const c = await findContactByName(r.orgId, intent.contactName);
        if (c) {
          const l = await findLeadForContact(r.orgId, c.id);
          leadId = l?.id ?? null;
          reply.contactId = c.id;
        }
      }
      if (!leadId) {
        reply.message =
          intent.reply +
          (intent.contactName
            ? ` (couldn't find an open lead for "${intent.contactName}", create one first)`
            : " (mention a contact name to attach this interaction to a lead)");
      } else {
        const [i] = await db
          .insert(interactionsTable)
          .values({
            orgId: r.orgId,
            leadId,
            createdBy: r.userId,
            type: intent.interaction.type,
            date: new Date().toISOString().slice(0, 10),
            gist: intent.interaction.gist,
            gains: intent.interaction.gains ?? [],
            misses: intent.interaction.misses ?? [],
            actionItems: [],
            nextStep: intent.interaction.nextStep ?? null,
            sentiment: intent.interaction.sentiment ?? null,
          })
          .returning();
        reply.interactionId = i.id;
        reply.leadId = leadId;
      }
    } else if (intent.intent === "send_proposal") {
      if (!intent.contactName) {
        reply.message = "Tell me which contact this proposal is for (e.g. \"send Sarah a proposal about pricing\").";
      } else {
        const c = await findContactByName(r.orgId, intent.contactName);
        if (!c) {
          reply.message = `Couldn't find contact "${intent.contactName}". Add them first, then ask again.`;
        } else {
          reply.contactId = c.id;
          const l = await findLeadForContact(r.orgId, c.id);
          if (!l) {
            reply.message = `Found ${c.name}, but no open lead. Create a lead first, then I can draft the proposal.`;
          } else {
            reply.leadId = l.id;
            const [company] = c.companyId
              ? await db
                  .select()
                  .from(companiesTable)
                  .where(and(eq(companiesTable.id, c.companyId), eq(companiesTable.orgId, r.orgId)))
                  .limit(1)
              : [null];
            const interactions = await db
              .select()
              .from(interactionsTable)
              .where(and(eq(interactionsTable.leadId, l.id), eq(interactionsTable.orgId, r.orgId)))
              .orderBy(desc(interactionsTable.date), desc(interactionsTable.createdAt))
              .limit(15);
            const [creds] = await db
              .select()
              .from(companyCredentialsTable)
              .where(eq(companyCredentialsTable.orgId, r.orgId))
              .limit(1);
            const html = await generateProposalHtml({
              branding: creds ?? null,
              contact: c,
              company: company ?? null,
              lead: l,
              interactions,
              extraContext: intent.proposalContext ?? null,
            });
            const title = `Proposal — ${c.name}${company ? ` (${company.name})` : ""}`;
            const [doc] = await db
              .insert(documentsTable)
              .values({
                orgId: r.orgId,
                leadId: l.id,
                type: "proposal",
                title,
                content: html,
                format: "html",
                status: "draft",
              })
              .returning();
            reply.documentId = doc.id;
            if (intent.sendEmail) {
              const recipient = (c.email ?? "").trim();
              if (!recipient) {
                reply.message = `Drafted "${title}", but ${c.name} has no email on file — open the document to send manually.`;
              } else {
                try {
                  await sendProposalEmail({
                    to: recipient,
                    subject: title,
                    html,
                    fromName: creds?.companyName ?? null,
                  });
                  await db
                    .update(documentsTable)
                    .set({ status: "sent", sentAt: new Date() })
                    .where(
                      and(eq(documentsTable.id, doc.id), eq(documentsTable.orgId, r.orgId)),
                    );
                  const [logged] = await db
                    .insert(interactionsTable)
                    .values({
                      orgId: r.orgId,
                      leadId: l.id,
                      createdBy: r.userId,
                      type: "email",
                      date: new Date().toISOString().slice(0, 10),
                      gist: `Emailed "${title}" to ${recipient}`,
                      gains: [],
                      misses: [],
                      actionItems: [],
                      nextStep: null,
                      sentiment: null,
                    })
                    .returning();
                  reply.interactionId = logged.id;
                  reply.message = `Drafted and emailed "${title}" to ${recipient}.`;
                } catch (err) {
                  req.log.error({ err }, "Chat send_proposal: gmail send failed");
                  reply.message = `Drafted "${title}", but Gmail send failed. Open the document and try Send via Gmail.`;
                }
              }
            } else {
              reply.message = `Drafted "${title}". Open Documents to review or send.`;
            }
          }
        }
      }
    } else if (intent.intent === "update_lead_stage" && intent.stage && intent.contactName) {
      const c = await findContactByName(r.orgId, intent.contactName);
      if (c) {
        const l = await findLeadForContact(r.orgId, c.id);
        if (l) {
          await db
            .update(leadsTable)
            .set({ stage: intent.stage })
            .where(eq(leadsTable.id, l.id));
          reply.leadId = l.id;
          reply.contactId = c.id;
        } else {
          reply.message = `Couldn't find a lead for ${intent.contactName}.`;
        }
      } else {
        reply.message = `Couldn't find contact ${intent.contactName}.`;
      }
    }
  } catch (err) {
    req.log.error({ err }, "Failed to apply chat intent");
    reply.success = false;
    reply.message = "I understood you but couldn't save that. Please try again.";
  }

  res.json(SendChatResponse.parse(reply));
});

export default router;
