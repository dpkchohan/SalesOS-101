import { Router, type IRouter } from "express";
import { and, eq, desc, asc } from "drizzle-orm";
import {
  db,
  chatSessionsTable,
  chatMessagesTable,
  contactsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

// POST /chat/sessions — create a chat session (optionally linked to a contact)
router.post("/chat/sessions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const contactId: string | null = req.body?.contactId ?? null;

  // If contactId provided, verify it belongs to this org
  if (contactId) {
    const [contact] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, r.orgId)));
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
  }

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

// GET /contacts/:id/chat-sessions — list sessions linked to a contact (newest first)
// Returns sessionId, createdAt, and the first user message as a preview.
router.get("/contacts/:id/chat-sessions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const contactId = String(req.params.id);
  try {
    // Verify contact belongs to this org
    const [contact] = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, r.orgId)));
    if (!contact) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    const sessions = await db
      .select()
      .from(chatSessionsTable)
      .where(
        and(
          eq(chatSessionsTable.orgId, r.orgId),
          eq(chatSessionsTable.contactId, contactId),
        ),
      )
      .orderBy(desc(chatSessionsTable.createdAt))
      .limit(50);

    // Fetch first user message for each session (preview)
    const sessionIds = sessions.map((s) => s.id);
    const previews: Record<string, string> = {};
    if (sessionIds.length > 0) {
      for (const sid of sessionIds) {
        const [first] = await db
          .select({ content: chatMessagesTable.content })
          .from(chatMessagesTable)
          .where(
            and(
              eq(chatMessagesTable.sessionId, sid),
              eq(chatMessagesTable.role, "user"),
            ),
          )
          .orderBy(asc(chatMessagesTable.createdAt))
          .limit(1);
        if (first) previews[sid] = first.content;
      }
    }

    res.json(
      sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        preview: previews[s.id] ?? null,
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list chat sessions for contact");
    res.status(500).json({ error: "Failed to load chat history" });
  }
});

// GET /chat-sessions/:id/messages — full transcript for a session
router.get("/chat-sessions/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const sessionId = String(req.params.id);
  try {
    // Verify session belongs to this org
    const [session] = await db
      .select()
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.id, sessionId), eq(chatSessionsTable.orgId, r.orgId)));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, sessionId))
      .orderBy(asc(chatMessagesTable.createdAt));

    res.json({ session, messages });
  } catch (err) {
    req.log.error({ err }, "Failed to load chat session messages");
    res.status(500).json({ error: "Failed to load messages" });
  }
});

export default router;
