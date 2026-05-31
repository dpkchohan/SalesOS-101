import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";

export const chatSessionsTable = pgTable(
  "chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contactsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chat_sessions_org_idx").on(t.orgId),
    index("chat_sessions_contact_idx").on(t.contactId),
    index("chat_sessions_user_idx").on(t.userId),
  ],
);

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessionsTable.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId)],
);

export type ChatSession = typeof chatSessionsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
