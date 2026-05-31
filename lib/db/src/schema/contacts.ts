import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
    customerNo: text("customer_no"),
    name: text("name").notNull(),
    email: text("email"),
    emailNormalized: text("email_normalized"),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    tags: text("tags").array().notNull().default([]),
    importJobId: uuid("import_job_id"),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOf: uuid("duplicate_of").references((): AnyPgColumn => contactsTable.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergedReason: text("merged_reason"),
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
    index("contacts_duplicate_of_idx").on(t.duplicateOf),
    // Race-safe per-org dedupe: enforce one contact per (org, normalized email)
    // when an email is provided. NULL emails are allowed to repeat.
    uniqueIndex("contacts_org_email_unique")
      .on(t.orgId.op("uuid_ops"), sql`lower(${t.email}) text_ops`)
      .where(sql`${t.email} is not null and ${t.isDuplicate} = false`),
    uniqueIndex("contacts_org_phone_unique")
      .on(t.orgId.op("uuid_ops"), t.phoneNormalized.op("text_ops"))
      .where(sql`${t.phoneNormalized} is not null and ${t.isDuplicate} = false`),
    uniqueIndex("contacts_org_customer_no_unique")
      .on(t.orgId.op("uuid_ops"), t.customerNo.op("text_ops"))
      .where(sql`${t.customerNo} is not null`),
  ],
);

export const orgContactCountersTable = pgTable("org_contact_counters", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  lastNo: integer("last_no").notNull().default(0),
});

export type Contact = typeof contactsTable.$inferSelect;
