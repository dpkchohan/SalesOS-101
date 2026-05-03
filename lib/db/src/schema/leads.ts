import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { contactsTable } from "./contacts";
import { usersTable } from "./users";

export const leadsTable = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contactsTable.id, { onDelete: "cascade" }),
    assignedTo: uuid("assigned_to").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    stage: text("stage").notNull().default("new"),
    valueUsd: integer("value_usd"),
    currency: text("currency").notNull().default("USD"),
    closeDate: date("close_date"),
    source: text("source"),
    importJobId: uuid("import_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leads_org_idx").on(t.orgId),
    index("leads_stage_idx").on(t.stage),
    index("leads_contact_idx").on(t.contactId),
  ],
);

export type Lead = typeof leadsTable.$inferSelect;
