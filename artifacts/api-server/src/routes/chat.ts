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
  chatSessionsTable,
  chatMessagesTable,
} from "@workspace/db";
import { SendChatBody, SendChatResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { assignCustomerNo, findDuplicate, normalizeEmail, normalizePhone } from "../lib/dedup";
import Anthropic from "@anthropic-ai/sdk";
import { claudeJson, getClaude, CLAUDE_MODEL } from "../lib/claude";
import { generateProposalHtml } from "../lib/proposalGen";
import { sendProposalEmail } from "../lib/gmail";

const router: IRouter = Router();

interface Intent {
  intent:
    | "create_task"
    | "log_interaction"
    | "create_contact"
    | "create_lead"
    | "update_lead_stage"
    | "send_proposal"
    | "query_calendar"
    | "query_pipeline"
    | "search"
    | "general";
  reply: string;
  // create_task
  task?: { title: string; dueDate?: string | null; dueTime?: string | null; priority?: "high" | "medium" | "low" };
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
  // create_lead
  lead?: {
    stage?: "new" | "interested" | "qualified" | "negotiating" | "won" | "lost";
    valueUsd?: number | null;
    currency?: string | null;
    closeDate?: string | null;
    source?: string | null;
  };
  // update_lead_stage
  stage?: "new" | "interested" | "qualified" | "negotiating" | "won" | "lost";
  // send_proposal
  proposalContext?: string | null;
  sendEmail?: boolean;
}

const SYSTEM = `You are SalesOS, an in-app assistant for a sales rep. Parse the user's message into a structured intent. Always reply with strict JSON, no prose outside JSON.

Intents:
- "create_task": user wants a to-do or scheduled meeting. Examples: "remind me to follow up with Acme tomorrow", "schedule a follow-up with John next Tuesday at 2pm" (set dueTime="14:00"). When a clock time is mentioned, fill task.dueTime as 24h "HH:MM"; otherwise omit.
- "log_interaction": user wants to log a call/email/meeting/note. Example: "logged a call with John, he wants pricing by Friday"
- "create_contact": user wants to add a new contact. Example: "add new contact Sarah Lee at Globex, sarah@globex.com"
- "create_lead": user wants to create a new lead/deal for a contact. Example: "create a lead for Acme, $5000 deal in negotiation" → contactName="Acme contact", lead.valueUsd=5000, lead.stage="negotiating". Also use this when user says "add deal", "open a deal", "new opportunity".
- "update_lead_stage": user wants to move a lead to a different stage. Stages: new, interested, qualified, negotiating, won, lost
- "send_proposal": user wants to generate a proposal. Example: "send John Smith a proposal about pricing and timeline" → contactName="John Smith", proposalContext="pricing and timeline". If the user explicitly asks to ALSO email it (e.g. "send AND email", "draft and email", "email it to them"), set sendEmail=true; otherwise omit sendEmail.
- "query_calendar": user asks about upcoming calendar events, schedule, meetings, or what's on their calendar. Examples: "what's on my calendar?", "show my upcoming meetings", "what do I have this week?", "any meetings today?"
- "query_pipeline": user asks about their pipeline, deals, leads, revenue, or sales summary. Examples: "show my pipeline", "what deals do I have?", "how many leads?", "what's my total pipeline value?"
- "search": user is looking for info about a specific contact or lead by name
- "general": fallback for greetings and questions

Respond JSON shape:
{
  "intent": "...",
  "reply": "<one short, friendly confirmation or answer>",
  "task": { "title": "...", "dueDate": "YYYY-MM-DD or null", "dueTime": "HH:MM 24h or null", "priority": "low|medium|high" },
  "contactName": "<contact to attach the task/interaction/stage update/lead to, if mentioned>",
  "interaction": { "type": "call|email|meeting|note", "gist": "...", "gains": [], "misses": [], "nextStep": "...", "sentiment": "positive|neutral|negative" },
  "contact": { "name": "...", "email": "...", "phone": "...", "title": "..." },
  "lead": { "stage": "new|interested|qualified|negotiating|won|lost", "valueUsd": number or null, "currency": "USD", "closeDate": "YYYY-MM-DD or null", "source": "string or null" },
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

// ── Claude tool-use handler for contact-linked sessions ───────────────────────
async function processWithTools(params: {
  orgId: string;
  contactId: string;
  userText: string;
  log: { warn: (obj: object, msg: string) => void };
}): Promise<string> {
  const { orgId, contactId, userText, log } = params;

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, orgId)));

  if (!contact) return "Contact not found.";

  const systemPrompt = `You are a sales assistant for SalesOS. You are currently helping with contact: ${contact.name} (ID: ${contact.id}).
You have access to tools to actually modify the database. When the user asks you to add a note, create a task, or update contact details, USE THE TOOLS to actually do it, then confirm what you did.
Always be concise and action-oriented.`;

  const tools: Anthropic.Tool[] = [
    {
      name: "add_note",
      description: "Add or update a note for this contact",
      input_schema: {
        type: "object",
        properties: { note: { type: "string", description: "Note content to save" } },
        required: ["note"],
      },
    },
    {
      name: "create_task",
      description: "Create a task linked to this contact",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title"],
      },
    },
    {
      name: "update_contact",
      description: "Update contact fields like title, phone, email, tags, notes",
      input_schema: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "Fields to update: title, phone, email, tags (string[]), notes",
          },
        },
        required: ["fields"],
      },
    },
  ];

  const claude = getClaude();
  const userMessage: Anthropic.MessageParam = { role: "user", content: userText };

  const response = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [userMessage],
    tools,
  });

  const toolUseBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (toolUseBlocks.length === 0) {
    return (
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("") || "Done."
    );
  }

  const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

  for (const toolBlock of toolUseBlocks) {
    let resultText = "";
    try {
      if (toolBlock.name === "add_note") {
        const input = toolBlock.input as { note: string };
        await db
          .update(contactsTable)
          .set({ notes: input.note })
          .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, orgId)));
        resultText = "Note saved.";
      } else if (toolBlock.name === "create_task") {
        const input = toolBlock.input as {
          title: string;
          due_date?: string;
          priority?: "low" | "medium" | "high";
        };
        const lead = await findLeadForContact(orgId, contactId);
        const [task] = await db
          .insert(tasksTable)
          .values({
            orgId,
            leadId: lead?.id ?? null,
            title: input.title,
            dueDate: input.due_date ?? null,
            priority: input.priority ?? "medium",
          })
          .returning();
        resultText = `Task created: "${task.title}"${task.dueDate ? ` due ${task.dueDate}` : ""}.`;
      } else if (toolBlock.name === "update_contact") {
        const input = toolBlock.input as { fields: Record<string, unknown> };
        const updates: Record<string, unknown> = {};
        if (input.fields.title !== undefined) updates.title = input.fields.title;
        if (input.fields.phone !== undefined) updates.phone = input.fields.phone;
        if (input.fields.email !== undefined) updates.email = input.fields.email;
        if (input.fields.notes !== undefined) updates.notes = input.fields.notes;
        if (input.fields.tags !== undefined) updates.tags = input.fields.tags;
        await db
          .update(contactsTable)
          .set(updates)
          .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, orgId)));
        resultText = `Updated: ${Object.keys(input.fields).join(", ")}.`;
      } else {
        resultText = "Unknown tool.";
      }
    } catch (err) {
      resultText = `Error: ${err instanceof Error ? err.message : "Unknown error"}`;
      log.warn({ err, tool: toolBlock.name }, "Tool execution failed");
    }
    toolResultContent.push({ type: "tool_result", tool_use_id: toolBlock.id, content: resultText });
  }

  const finalResponse = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      userMessage,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResultContent },
    ],
    tools,
  });

  return (
    finalResponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("") || "Done."
  );
}
// ─────────────────────────────────────────────────────────────────────────────

async function findLeadForContact(orgId: string, contactId: string) {
  const [l] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.orgId, orgId), eq(leadsTable.contactId, contactId)))
    .orderBy(desc(leadsTable.updatedAt))
    .limit(1);
  return l ?? null;
}

// ── POST /chat/sessions — pre-create a chat session ──────────────────────────
router.post("/chat/sessions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const contactId = typeof req.body?.contactId === "string" ? req.body.contactId : null;
  try {
    const [session] = await db
      .insert(chatSessionsTable)
      .values({ orgId: r.orgId, userId: r.userId, contactId })
      .returning();
    res.json({ sessionId: session.id });
  } catch (err) {
    req.log.error({ err }, "Failed to create chat session");
    res.status(500).json({ error: "Failed to create session" });
  }
});

// ── GET /chat-sessions/:id/messages — load transcript ────────────────────────
router.get("/chat-sessions/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const sessionId = req.params.id;
  try {
    const [session] = await db
      .select({ id: chatSessionsTable.id })
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.id, sessionId), eq(chatSessionsTable.orgId, r.orgId)));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const messages = await db
      .select({
        id: chatMessagesTable.id,
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        createdAt: chatMessagesTable.createdAt,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, sessionId))
      .orderBy(chatMessagesTable.createdAt);
    res.json({ messages });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch session messages");
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

router.post("/chat", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = SendChatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const incomingContactId = body.data.contactId ?? null;
  const incomingSessionId = body.data.sessionId ?? null;

  // Resolve or create a chat session
  let sessionId: string | null = null;
  try {
    if (incomingSessionId) {
      // Verify session belongs to this org
      const [existing] = await db
        .select({ id: chatSessionsTable.id })
        .from(chatSessionsTable)
        .where(
          and(
            eq(chatSessionsTable.id, incomingSessionId),
            eq(chatSessionsTable.orgId, r.orgId),
          ),
        );
      if (existing) sessionId = existing.id;
    }
    if (!sessionId) {
      const [session] = await db
        .insert(chatSessionsTable)
        .values({
          orgId: r.orgId,
          userId: r.userId,
          contactId: incomingContactId,
        })
        .returning();
      sessionId = session.id;
    }
    // Save user message
    await db.insert(chatMessagesTable).values({
      sessionId,
      role: "user",
      content: body.data.text,
    });
  } catch (err) {
    req.log.warn({ err }, "chat: failed to persist session/message — continuing without persistence");
  }

  // Determine effective contactId (from request body or from the session record)
  let effectiveContactId = incomingContactId;
  if (!effectiveContactId && sessionId) {
    try {
      const [sess] = await db
        .select({ contactId: chatSessionsTable.contactId })
        .from(chatSessionsTable)
        .where(eq(chatSessionsTable.id, sessionId));
      effectiveContactId = sess?.contactId ?? null;
    } catch { /* ok — fall through to general path */ }
  }

  const reply = {
    success: true as boolean,
    message: "Done.",
    intent: "general",
    sessionId,
    contactId: effectiveContactId,
    leadId: null as string | null,
    taskId: null as string | null,
    interactionId: null as string | null,
    documentId: null as string | null,
    duplicateDetected: null as boolean | null,
    duplicateContact: null as Record<string, unknown> | null,
    duplicateMatchedField: null as string | null,
  };

  if (effectiveContactId) {
    // ── Contact-linked session → use Claude tool use ──────────────────────────
    try {
      reply.message = await processWithTools({
        orgId: r.orgId,
        contactId: effectiveContactId,
        userText: body.data.text,
        log: req.log,
      });
    } catch (err) {
      req.log.error({ err }, "processWithTools failed");
      reply.success = false;
      reply.message = "I couldn't process that. Try again.";
    }
  } else {
  // ── General session → JSON intent parsing ────────────────────────────────────

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
        sessionId,
      }),
    );
    return;
  }

  reply.message = intent.reply ?? "Done.";
  reply.intent = intent.intent ?? "general";

  try {
    if (intent.intent === "create_lead" && intent.contactName) {
      const c = await findContactByName(r.orgId, intent.contactName);
      if (!c) {
        reply.message = `Couldn't find contact "${intent.contactName}". Add them first, then create the lead.`;
      } else {
        reply.contactId = c.id;
        const [l] = await db
          .insert(leadsTable)
          .values({
            orgId: r.orgId,
            contactId: c.id,
            stage: intent.lead?.stage ?? "new",
            valueUsd: intent.lead?.valueUsd ?? null,
            currency: intent.lead?.currency ?? "USD",
            closeDate: intent.lead?.closeDate ?? null,
            source: intent.lead?.source ?? null,
          })
          .returning();
        reply.leadId = l.id;
      }
    } else if (intent.intent === "create_contact" && intent.contact?.name) {
      const dup = await findDuplicate({
        orgId: r.orgId,
        email: intent.contact.email ?? null,
        phone: intent.contact.phone ?? null,
      });
      if (dup) {
        reply.duplicateDetected = true;
        reply.duplicateMatchedField = dup.matchedField;
        reply.duplicateContact = {
          id: dup.contact.id,
          customerNo: dup.contact.customerNo,
          name: dup.contact.name,
          email: dup.contact.email,
          phone: dup.contact.phone,
          companyId: dup.contact.companyId,
          title: dup.contact.title,
          tags: dup.contact.tags,
          createdAt: dup.contact.createdAt,
          updatedAt: dup.contact.updatedAt,
        };
        reply.contactId = dup.contact.id;
        reply.message = `Looks like ${dup.contact.name} (${dup.contact.customerNo ?? "no CUST#"}) already exists with the same ${dup.matchedField}. Open them or force-create from the contact form.`;
      } else {
        const customerNo = await assignCustomerNo(r.orgId);
        const [c] = await db
          .insert(contactsTable)
          .values({
            orgId: r.orgId,
            customerNo,
            name: intent.contact.name,
            email: intent.contact.email ?? null,
            emailNormalized: normalizeEmail(intent.contact.email ?? null),
            phone: intent.contact.phone ?? null,
            phoneNormalized: normalizePhone(intent.contact.phone ?? null),
            title: intent.contact.title ?? null,
            tags: [],
          })
          .returning();
        reply.contactId = c.id;
        reply.message = `Added ${c.name} (${customerNo}).`;
      }
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
          dueTime:
            intent.task.dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(intent.task.dueTime)
              ? intent.task.dueTime
              : null,
          priority: intent.task.priority ?? "medium",
        })
        .returning();
      if (t.dueDate) {
        try {
          const { createCalendarEvent } = await import("../lib/gcal");
          const { id: eventId } = await createCalendarEvent(r.userId, {
            title: t.title,
            description: t.description,
            date: t.dueDate,
            time: t.dueTime,
          });
          await db
            .update(tasksTable)
            .set({ calendarEventId: eventId })
            .where(eq(tasksTable.id, t.id));
        } catch (err) {
          req.log.warn({ err, taskId: t.id }, "Calendar event create skipped (chat)");
        }
      }
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
    } else if (intent.intent === "query_calendar") {
      try {
        const { listUpcomingEvents } = await import("../lib/gcal");
        const events = await listUpcomingEvents(10, 7);
        if (events.length === 0) {
          reply.message = "No upcoming events in the next 7 days on your calendar.";
        } else {
          const lines = events.map((e) => {
            const start = new Date(e.start);
            const dateStr = isNaN(start.getTime())
              ? e.start
              : start.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            return `• **${e.title}** — ${dateStr}`;
          });
          reply.message = `Here are your upcoming events:\n\n${lines.join("\n")}`;
        }
      } catch (err) {
        req.log.warn({ err }, "Calendar query failed");
        reply.message = "Couldn't fetch your calendar right now. Make sure Google Calendar is connected in Settings.";
      }
    } else if (intent.intent === "query_pipeline") {
      const leads = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.orgId, r.orgId));

      const total = leads.length;
      const totalValue = leads.reduce((sum, l) => sum + (l.valueUsd ?? 0), 0);
      const byStage = leads.reduce<Record<string, number>>((acc, l) => {
        acc[l.stage] = (acc[l.stage] ?? 0) + 1;
        return acc;
      }, {});

      const stageLines = Object.entries(byStage)
        .map(([stage, count]) => `• **${stage}**: ${count}`)
        .join("\n");

      reply.message = `Pipeline summary — ${total} lead${total !== 1 ? "s" : ""}, total value $${totalValue.toLocaleString()}:\n\n${stageLines || "No leads yet."}`;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to apply chat intent");
    reply.success = false;
    reply.message = "I understood you but couldn't save that. Please try again.";
  }
  } // end else (general session)

  // Persist assistant reply
  if (sessionId) {
    try {
      await db.insert(chatMessagesTable).values({
        sessionId,
        role: "assistant",
        content: reply.message,
      });
    } catch (err) {
      req.log.warn({ err }, "chat: failed to save assistant message");
    }
  }

  res.json(SendChatResponse.parse(reply));
});

export default router;
