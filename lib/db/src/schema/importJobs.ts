import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const importJobsTable = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    filePath: text("file_path"),
    status: text("status").notNull().default("preview"),
    totalRows: integer("total_rows").notNull().default(0),
    processedRows: integer("processed_rows").notNull().default(0),
    contactsCreated: integer("contacts_created").notNull().default(0),
    contactsUpdated: integer("contacts_updated").notNull().default(0),
    leadsCreated: integer("leads_created").notNull().default(0),
    companiesCreated: integer("companies_created").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    totalBatches: integer("total_batches").notNull().default(0),
    completedBatches: integer("completed_batches").notNull().default(0),
    preview: jsonb("preview"),
    batchResults: jsonb("batch_results").notNull().default([]),
    errorLog: jsonb("error_log").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("import_jobs_org_idx").on(t.orgId),
    index("import_jobs_status_idx").on(t.status),
  ],
);

export type ImportJob = typeof importJobsTable.$inferSelect;
