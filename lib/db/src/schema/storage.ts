import {
  pgTable,
  uuid,
  bigint,
  timestamp,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

/**
 * Storage quota tracking with three tiers:
 *
 *  free     — 250 MB per user   (default for new users)
 *  premium  — 2 GB per user
 *  org      — 5 GB shared per organization
 *
 * For free/premium: one row per user  (PK = user_id, org_id = null)
 * For org-tier:     one row per org   (org_id unique, user_id = org owner's id)
 *
 * Key prefix in S3:
 *  free/premium → {userId}/…
 *  org          → {orgId}/…
 */
export const storageUsageTable = pgTable(
  "storage_usage",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizationsTable.id, {
      onDelete: "cascade",
    }),
    tier: text("tier", { enum: ["free", "premium", "org"] })
      .notNull()
      .default("free"),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    quotaBytes: bigint("quota_bytes", { mode: "number" })
      .notNull()
      .default(262144000), // 250 MB (free default; overridden per-tier on insert)
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("storage_usage_user_idx").on(t.userId),
    uniqueIndex("storage_usage_org_uniq").on(t.orgId), // one shared row per org
  ],
);

export type StorageUsage = typeof storageUsageTable.$inferSelect;
export type StorageTier = "free" | "premium" | "org";

export const QUOTA_BYTES: Record<StorageTier, number> = {
  free: 262_144_000,      // 250 MB
  premium: 2_147_483_648, // 2 GB
  org: 5_368_709_120,     // 5 GB
};
