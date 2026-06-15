import {
  pgTable,
  text,
  timestamp,
  uuid,
  date,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { leadsTable } from "./leads";
import { usersTable } from "./users";

export type ActionItem = { title: string; dueDate?: string | null };

export const interactionsTable = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    date: date("date").notNull(),
    time: text("time"),
    gist: text("gist").notNull(),
    gains: text("gains").array().notNull().default([]),
    misses: text("misses").array().notNull().default([]),
    actionItems: jsonb("action_items").$type<ActionItem[]>().notNull().default([]),
    nextStep: text("next_step"),
    durationMinutes: integer("duration_minutes"),
    sentiment: text("sentiment"),
    emailMessageId: text("email_message_id"),
    emailThreadId: text("email_thread_id"),
    emailSubject: text("email_subject"),
    emailDirection: text("email_direction"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("interactions_org_idx").on(t.orgId),
    index("interactions_lead_idx").on(t.leadId),
    uniqueIndex("interactions_email_message_id_uniq")
      .on(t.emailMessageId)
      .where(sql`email_message_id IS NOT NULL`),
  ],
);

export type Interaction = typeof interactionsTable.$inferSelect;
