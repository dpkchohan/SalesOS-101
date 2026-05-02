import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").unique(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default("rep"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_org_idx").on(t.orgId), index("users_email_idx").on(t.email)],
);

export type User = typeof usersTable.$inferSelect;
