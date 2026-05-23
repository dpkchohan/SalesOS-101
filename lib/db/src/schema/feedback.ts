import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const feedbackTable = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    criticality: integer("criticality").notNull().default(3),
    description: text("description").notNull(),
    screenshotUrl: text("screenshot_url"),
    pageUrl: text("page_url").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feedback_org_idx").on(t.orgId),
    index("feedback_user_idx").on(t.userId),
    index("feedback_status_idx").on(t.status),
  ],
);

export type Feedback = typeof feedbackTable.$inferSelect;
