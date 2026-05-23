import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const errorsTable = pgTable(
  "errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    message: text("message").notNull(),
    stack: text("stack"),
    pageUrl: text("page_url").notNull(),
    userAgent: text("user_agent"),
    status: text("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("errors_org_idx").on(t.orgId),
    index("errors_user_idx").on(t.userId),
    index("errors_created_idx").on(t.createdAt),
  ],
);

export type AppError = typeof errorsTable.$inferSelect;
