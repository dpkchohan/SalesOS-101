import { and, eq, or, sql } from "drizzle-orm";
import { db, contactsTable } from "@workspace/db";

export function normalizeEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  if (!t) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return null;
  return t;
}

export function normalizePhone(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  return (hasPlus ? "+" : "") + digits;
}

export type DuplicateMatchField = "email" | "phone";

export interface DuplicateMatch {
  contact: typeof contactsTable.$inferSelect;
  matchedField: DuplicateMatchField;
}

export async function findDuplicate(opts: {
  orgId: string;
  email?: string | null;
  phone?: string | null;
  excludeId?: string | null;
}): Promise<DuplicateMatch | null> {
  const email = normalizeEmail(opts.email ?? null);
  const phone = normalizePhone(opts.phone ?? null);
  if (!email && !phone) return null;

  const orClauses = [];
  if (email) orClauses.push(sql`lower(${contactsTable.email}) = ${email}`);
  if (phone) orClauses.push(eq(contactsTable.phoneNormalized, phone));

  const conditions = [
    eq(contactsTable.orgId, opts.orgId),
    eq(contactsTable.isDuplicate, false),
    or(...orClauses)!,
  ];
  if (opts.excludeId) conditions.push(sql`${contactsTable.id} <> ${opts.excludeId}`);

  const rows = await db
    .select()
    .from(contactsTable)
    .where(and(...conditions))
    .limit(5);
  if (rows.length === 0) return null;

  // Prefer email match over phone match
  if (email) {
    const e = rows.find((r) => (r.email ?? "").toLowerCase() === email);
    if (e) return { contact: e, matchedField: "email" };
  }
  return { contact: rows[0], matchedField: "phone" };
}

/**
 * Assign next per-org sequential customer_no like CUST-000123.
 * Race-safe: SELECT ... FOR UPDATE on counter row inside a transaction.
 * Caller passes a contactId to update, OR omit to just get a number string.
 */
export async function assignCustomerNo(orgId: string): Promise<string> {
  return await db.transaction(async (tx) => {
    // Upsert counter row, bump atomically.
    const result = await tx.execute<{ last_no: number }>(sql`
      INSERT INTO org_contact_counters (org_id, last_no)
      VALUES (${orgId}, 1)
      ON CONFLICT (org_id)
      DO UPDATE SET last_no = org_contact_counters.last_no + 1
      RETURNING last_no
    `);
    const n = result.rows[0]?.last_no ?? 1;
    return formatCustomerNo(n);
  });
}

export function formatCustomerNo(n: number): string {
  return `CUST-${String(n).padStart(6, "0")}`;
}

export function isCustomerNoSearch(s: string): boolean {
  return /^CUST-?\d+/i.test(s.trim());
}
