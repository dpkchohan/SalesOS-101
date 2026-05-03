import {
  pgTable,
  text,
  timestamp,
  uuid,
  date,
  index,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { leadsTable } from "./leads";
import { usersTable } from "./users";

export const tasksTable = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leadsTable.id, {
      onDelete: "cascade",
    }),
    assignedTo: uuid("assigned_to").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    dueTime: text("due_time"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    priority: text("priority").notNull().default("medium"),
    calendarEventId: text("calendar_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_org_idx").on(t.orgId),
    index("tasks_due_idx").on(t.dueDate),
    index("tasks_lead_idx").on(t.leadId),
  ],
);

export type Task = typeof tasksTable.$inferSelect;
