import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { companiesTable } from "./companies";

export const contactsTable = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companiesTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    tags: text("tags").array().notNull().default([]),
    importJobId: uuid("import_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("contacts_org_idx").on(t.orgId),
    index("contacts_email_idx").on(t.email),
    index("contacts_company_idx").on(t.companyId),
  ],
);

export type Contact = typeof contactsTable.$inferSelect;
