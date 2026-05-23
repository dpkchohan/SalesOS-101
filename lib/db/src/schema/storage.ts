import { pgTable, uuid, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const storageUsageTable = pgTable(
  "storage_usage",
  {
    orgId: uuid("org_id")
      .primaryKey()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    quotaBytes: bigint("quota_bytes", { mode: "number" })
      .notNull()
      .default(262144000), // 250 MB
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("storage_usage_org_idx").on(t.orgId)],
);

export type StorageUsage = typeof storageUsageTable.$inferSelect;
