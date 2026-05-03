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

export const chatAttachmentsTable = pgTable(
  "chat_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: integer("file_size").notNull().default(0),
    storageKey: text("storage_key").notNull(),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    extractedData: jsonb("extracted_data"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("chat_attachments_org_idx").on(t.orgId),
    index("chat_attachments_status_idx").on(t.extractionStatus),
  ],
);

export type ChatAttachment = typeof chatAttachmentsTable.$inferSelect;
