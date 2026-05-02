import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { leadsTable } from "./leads";

export const aiSignalsTable = pgTable(
  "ai_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    severity: text("severity").notNull().default("medium"),
    message: text("message").notNull(),
    recommendation: text("recommendation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("signals_org_idx").on(t.orgId),
    index("signals_lead_idx").on(t.leadId),
  ],
);

export type AiSignal = typeof aiSignalsTable.$inferSelect;
