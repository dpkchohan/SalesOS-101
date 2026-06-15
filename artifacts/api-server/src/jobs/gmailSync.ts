import { and, eq, isNotNull } from "drizzle-orm";
import {
  db,
  googleConnectionsTable,
  contactsTable,
  leadsTable,
  interactionsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { getValidAccessToken, hasGmailReadScope } from "../lib/googleTokens";
import {
  getGmailProfile,
  fetchRecentMessages,
  fetchHistoryMessages,
  type GmailMessage,
} from "../lib/gmailReader";
import { checkAndAdvanceStage } from "../lib/stageProgression";

function parseEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match ? match[1] : header).trim().toLowerCase();
}

function parseEmailAddresses(header: string): string[] {
  return header
    .split(/,(?![^<]*>)/)
    .map((e) => parseEmailAddress(e.trim()))
    .filter(Boolean);
}

async function processMessages(
  conn: typeof googleConnectionsTable.$inferSelect,
  messages: GmailMessage[],
): Promise<void> {
  if (messages.length === 0) return;

  const contacts = await db
    .select({ id: contactsTable.id, emailNormalized: contactsTable.emailNormalized })
    .from(contactsTable)
    .where(and(eq(contactsTable.orgId, conn.orgId), isNotNull(contactsTable.emailNormalized)));

  const emailToContactId = new Map<string, string>();
  for (const c of contacts) {
    if (c.emailNormalized) emailToContactId.set(c.emailNormalized.toLowerCase(), c.id);
  }

  const myEmail = conn.googleEmail.toLowerCase();

  for (const msg of messages) {
    const fromEmail = parseEmailAddress(msg.from);
    const toEmails = parseEmailAddresses(msg.to);

    const direction = fromEmail === myEmail ? "outbound" : "inbound";
    const counterpartyEmail =
      direction === "inbound"
        ? fromEmail
        : toEmails.find((e) => e !== myEmail) ?? toEmails[0] ?? "";

    if (!counterpartyEmail) continue;

    const contactId = emailToContactId.get(counterpartyEmail);
    if (!contactId) continue;

    const [lead] = await db
      .select({ id: leadsTable.id, stage: leadsTable.stage })
      .from(leadsTable)
      .where(and(eq(leadsTable.contactId, contactId), eq(leadsTable.orgId, conn.orgId)))
      .limit(1);

    if (!lead) continue;

    const inserted = await db
      .insert(interactionsTable)
      .values({
        orgId: conn.orgId,
        leadId: lead.id,
        type: direction === "inbound" ? "email_inbound" : "email_outbound",
        date: msg.date,
        gist: msg.subject || "(no subject)",
        gains: [],
        misses: [],
        actionItems: [],
        emailMessageId: msg.messageId,
        emailThreadId: msg.threadId,
        emailSubject: msg.subject,
        emailDirection: direction,
      })
      .onConflictDoNothing()
      .returning({ id: interactionsTable.id });

    if (!inserted.length) continue;

    checkAndAdvanceStage({
      orgId: conn.orgId,
      leadId: lead.id,
      text: `${msg.subject} ${msg.snippet}`.trim(),
      triggerType: "email",
    }).catch((err: unknown) => {
      logger.warn({ err, leadId: lead.id }, "gmailSync: stageProgression error (non-fatal)");
    });
  }
}

export async function runGmailSync(): Promise<void> {
  let connections: (typeof googleConnectionsTable.$inferSelect)[];
  try {
    connections = await db
      .select()
      .from(googleConnectionsTable)
      .where(eq(googleConnectionsTable.emailSyncEnabled, true));
  } catch (err: unknown) {
    logger.error({ err }, "gmailSync: failed to load connections");
    return;
  }

  const eligible = connections.filter((c) => hasGmailReadScope(c));
  if (eligible.length === 0) return;

  logger.info({ count: eligible.length }, "gmailSync: starting cycle");

  for (const conn of eligible) {
    try {
      const token = await getValidAccessToken(conn.userId);

      if (!conn.historyId) {
        logger.info({ userId: conn.userId }, "gmailSync: initial 30-day sync");
        const profile = await getGmailProfile(token);
        const messages = await fetchRecentMessages(token);
        await processMessages(conn, messages);
        await db
          .update(googleConnectionsTable)
          .set({ historyId: profile.historyId, lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(googleConnectionsTable.id, conn.id));
        logger.info(
          { userId: conn.userId, count: messages.length },
          "gmailSync: initial sync done",
        );
      } else {
        const { messages, newHistoryId } = await fetchHistoryMessages(token, conn.historyId);
        await processMessages(conn, messages);
        await db
          .update(googleConnectionsTable)
          .set({ historyId: newHistoryId, lastSyncedAt: new Date(), updatedAt: new Date() })
          .where(eq(googleConnectionsTable.id, conn.id));
        if (messages.length > 0) {
          logger.info(
            { userId: conn.userId, count: messages.length },
            "gmailSync: incremental sync done",
          );
        }
      }
    } catch (err: unknown) {
      logger.error({ err, userId: conn.userId }, "gmailSync: error — skipping this connection");
    }
  }
}
