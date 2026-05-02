import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { leadsTable } from "./leads";

export const documentsTable = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    format: text("format").notNull().default("html"),
    status: text("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_org_idx").on(t.orgId),
    index("documents_lead_idx").on(t.leadId),
  ],
);

export type Document = typeof documentsTable.$inferSelect;
