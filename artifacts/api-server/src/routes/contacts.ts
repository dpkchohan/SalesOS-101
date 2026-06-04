import { Router, type IRouter } from "express";
import { and, eq, or, ilike, sql, desc, inArray, asc, isNotNull } from "drizzle-orm";
import {
  db,
  contactsTable,
  companiesTable,
  leadsTable,
  interactionsTable,
  chatSessionsTable,
  chatMessagesTable,
} from "@workspace/db";
import {
  ListContactsQueryParams,
  ListContactsResponse,
  CreateContactBody,
  GetContactParams,
  GetContactResponse,
  UpdateContactParams,
  UpdateContactBody,
  UpdateContactResponse,
  DeleteContactParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  assignCustomerNo,
  findDuplicate,
  formatCustomerNo,
  isCustomerNoSearch,
  normalizeEmail,
  normalizePhone,
} from "../lib/dedup";

const router: IRouter = Router();

function contactDto(row: typeof contactsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    customerNo: row.customerNo,
    name: row.name,
    email: row.email,
    phone: row.phone,
    title: row.title,
    linkedinUrl: row.linkedinUrl,
    notes: row.notes,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/contacts", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListContactsQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  try {
    const { search, companyId, page, limit } = q.data;
    const conditions = [
      eq(contactsTable.orgId, r.orgId),
      eq(contactsTable.isDuplicate, false),
    ];
    if (companyId) conditions.push(eq(contactsTable.companyId, companyId));
    if (search) {
      const trimmed = search.trim();
      const s = `%${trimmed}%`;
      if (isCustomerNoSearch(trimmed)) {
        const norm = trimmed.toUpperCase().startsWith("CUST-")
          ? trimmed.toUpperCase()
          : `CUST-${trimmed.replace(/^CUST-?/i, "").padStart(6, "0")}`;
        conditions.push(
          or(
            eq(contactsTable.customerNo, norm),
            ilike(contactsTable.customerNo, `%${trimmed.replace(/^CUST-?/i, "")}%`),
            ilike(contactsTable.name, s),
          )!,
        );
      } else {
        conditions.push(
          or(
            ilike(contactsTable.name, s),
            ilike(contactsTable.email, s),
            ilike(contactsTable.title, s),
            ilike(contactsTable.customerNo, s),
          )!,
        );
      }
    }
    const where = and(...conditions);

    const totalRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contactsTable)
      .where(where);
    const total = totalRow[0]?.count ?? 0;

    const rows = await db
      .select({
        id: contactsTable.id,
        companyId: contactsTable.companyId,
        companyName: companiesTable.name,
        customerNo: contactsTable.customerNo,
        name: contactsTable.name,
        email: contactsTable.email,
        phone: contactsTable.phone,
        title: contactsTable.title,
        tags: contactsTable.tags,
        createdAt: contactsTable.createdAt,
        updatedAt: contactsTable.updatedAt,
      })
      .from(contactsTable)
      .leftJoin(
        companiesTable,
        and(
          eq(contactsTable.companyId, companiesTable.id),
          eq(companiesTable.orgId, r.orgId),
        ),
      )
      .where(where)
      .orderBy(desc(contactsTable.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    res.json(ListContactsResponse.parse({ data: rows, total, page, limit }));
  } catch (err) {
    req.log.error({ err }, "Failed to list contacts");
    res.status(500).json({ error: "Failed to list contacts" });
  }
});

// List soft-deleted duplicates so the user can review/unmerge.
router.get("/contacts/duplicates", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const rows = await db
      .select({
        id: contactsTable.id,
        customerNo: contactsTable.customerNo,
        name: contactsTable.name,
        email: contactsTable.email,
        phone: contactsTable.phone,
        title: contactsTable.title,
        duplicateOf: contactsTable.duplicateOf,
        mergedAt: contactsTable.mergedAt,
        mergedReason: contactsTable.mergedReason,
        createdAt: contactsTable.createdAt,
      })
      .from(contactsTable)
      .where(
        and(eq(contactsTable.orgId, r.orgId), eq(contactsTable.isDuplicate, true)),
      )
      .orderBy(desc(contactsTable.mergedAt))
      .limit(200);

    // Load primaries
    const primaryIds = Array.from(
      new Set(rows.map((r) => r.duplicateOf).filter((x): x is string => !!x)),
    );
    const primaries = primaryIds.length
      ? await db
          .select({
            id: contactsTable.id,
            customerNo: contactsTable.customerNo,
            name: contactsTable.name,
            email: contactsTable.email,
            phone: contactsTable.phone,
          })
          .from(contactsTable)
          .where(inArray(contactsTable.id, primaryIds))
      : [];
    const pMap = new Map(primaries.map((p) => [p.id, p]));

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        customerNo: row.customerNo,
        name: row.name,
        email: row.email,
        phone: row.phone,
        title: row.title,
        mergedAt: row.mergedAt ? row.mergedAt.toISOString() : null,
        mergedReason: row.mergedReason,
        createdAt: row.createdAt.toISOString(),
        primary: row.duplicateOf ? pMap.get(row.duplicateOf) ?? null : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list duplicates");
    res.status(500).json({ error: "Failed to list duplicates" });
  }
});

router.post("/contacts", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const force = req.body?.force === true;
  const body = CreateContactBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const { tags, ...rest } = body.data;
    const emailNorm = normalizeEmail(rest.email);
    const phoneNorm = normalizePhone(rest.phone);

    if (rest.companyId) {
      const [own] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(
          and(eq(companiesTable.id, rest.companyId), eq(companiesTable.orgId, r.orgId)),
        );
      if (!own) {
        res.status(400).json({ error: "Invalid companyId" });
        return;
      }
    }

    const existingDup = await findDuplicate({
      orgId: r.orgId,
      email: rest.email,
      phone: rest.phone,
    });
    if (existingDup && !force) {
      res.status(200).json({
        duplicateDetected: true,
        matchedField: existingDup.matchedField,
        existing: contactDto(existingDup.contact),
      });
      return;
    }

    const customerNo = await assignCustomerNo(r.orgId);
    // When forced over an existing duplicate, mark the new row as a duplicate of
    // the existing one so it shows up in the Duplicates tab and bypasses the
    // partial unique index (which excludes is_duplicate = true).
    const isForcedDuplicate = !!(existingDup && force);

    try {
      const [row] = await db
        .insert(contactsTable)
        .values({
          ...rest,
          email: rest.email ?? null,
          emailNormalized: emailNorm,
          phone: rest.phone ?? null,
          phoneNormalized: phoneNorm,
          tags: tags ?? [],
          orgId: r.orgId,
          customerNo,
          isDuplicate: isForcedDuplicate,
          duplicateOf: isForcedDuplicate ? existingDup.contact.id : null,
          mergedAt: isForcedDuplicate ? new Date() : null,
          mergedReason: isForcedDuplicate ? "user-forced" : null,
        })
        .returning();
      res.status(201).json(UpdateContactResponse.parse(contactDto(row)));
    } catch (err) {
      // Race: another writer inserted the same email/phone between findDuplicate and insert.
      const msg = err instanceof Error ? err.message : "";
      if (/contacts_org_email_unique|contacts_org_phone_unique/.test(msg)) {
        const dup = await findDuplicate({
          orgId: r.orgId,
          email: rest.email,
          phone: rest.phone,
        });
        if (dup) {
          if (force) {
            // Race: another writer inserted the primary between our findDuplicate
            // and insert. Retry the insert as a forced duplicate so it bypasses
            // the partial unique index (which excludes is_duplicate=true rows).
            const [row] = await db
              .insert(contactsTable)
              .values({
                ...rest,
                email: rest.email ?? null,
                emailNormalized: emailNorm,
                phone: rest.phone ?? null,
                phoneNormalized: phoneNorm,
                tags: tags ?? [],
                orgId: r.orgId,
                customerNo,
                isDuplicate: true,
                duplicateOf: dup.contact.id,
                mergedAt: new Date(),
                mergedReason: "user-forced",
              })
              .returning();
            res.status(201).json(UpdateContactResponse.parse(contactDto(row)));
            return;
          }
          res.status(200).json({
            duplicateDetected: true,
            matchedField: dup.matchedField,
            existing: contactDto(dup.contact),
          });
          return;
        }
      }
      throw err;
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create contact");
    res.status(500).json({ error: "Failed to create contact" });
  }
});

router.get("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [row] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)));
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    let company = null;
    if (row.companyId) {
      const [c] = await db
        .select()
        .from(companiesTable)
        .where(
          and(eq(companiesTable.id, row.companyId), eq(companiesTable.orgId, r.orgId)),
        );
      company = c ?? null;
    }
    const leads = await db.select().from(leadsTable).where(eq(leadsTable.contactId, row.id));
    const leadIds: string[] = leads.map((l: { id: string }) => l.id);
    let interactions: (typeof interactionsTable.$inferSelect)[] = [];
    if (leadIds.length > 0) {
      interactions = await db
        .select()
        .from(interactionsTable)
        .where(
          and(eq(interactionsTable.orgId, r.orgId), inArray(interactionsTable.leadId, leadIds)),
        )
        .orderBy(desc(interactionsTable.createdAt))
        .limit(20);
    }
    res.json(
      GetContactResponse.parse({
        ...contactDto(row),
        company,
        leads,
        interactions,
        isDuplicate: row.isDuplicate,
        duplicateOf: row.duplicateOf,
        mergedAt: row.mergedAt ?? null,
        mergedReason: row.mergedReason,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get contact");
    res.status(500).json({ error: "Failed to get contact" });
  }
});

// Related: same email domain, same phone, same company, same merged-into primary
router.get("/contacts/:id/related", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const id = String(req.params.id);
  try {
    const [row] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, id), eq(contactsTable.orgId, r.orgId)));
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }

    // Soft-deleted dupes that point to this contact
    const dupesOfThis = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.orgId, r.orgId),
          eq(contactsTable.duplicateOf, row.id),
          eq(contactsTable.isDuplicate, true),
        ),
      )
      .orderBy(desc(contactsTable.mergedAt));

    // Same company contacts (active only)
    const sameCompany =
      row.companyId
        ? await db
            .select()
            .from(contactsTable)
            .where(
              and(
                eq(contactsTable.orgId, r.orgId),
                eq(contactsTable.companyId, row.companyId),
                eq(contactsTable.isDuplicate, false),
                sql`${contactsTable.id} <> ${row.id}`,
              ),
            )
            .orderBy(asc(contactsTable.name))
            .limit(20)
        : [];

    // Same email domain — skip common consumer email providers to avoid noise
    const COMMON_EMAIL_DOMAINS = new Set([
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
      "icloud.com", "live.com", "rediffmail.com", "ymail.com",
      "protonmail.com", "aol.com", "zoho.com", "mail.com",
      "yahoo.in", "yahoo.co.in", "hotmail.co.in", "googlemail.com",
      "msn.com", "me.com", "mac.com",
    ]);
    let sameDomain: (typeof contactsTable.$inferSelect)[] = [];
    const domain = (row.email ?? "").split("@")[1]?.toLowerCase();
    if (domain && !COMMON_EMAIL_DOMAINS.has(domain)) {
      sameDomain = await db
        .select()
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.orgId, r.orgId),
            eq(contactsTable.isDuplicate, false),
            sql`lower(split_part(${contactsTable.email}, '@', 2)) = ${domain}`,
            sql`${contactsTable.id} <> ${row.id}`,
          ),
        )
        .orderBy(asc(contactsTable.name))
        .limit(20);
    }

    res.json({
      duplicates: dupesOfThis.map(contactDto),
      sameCompany: sameCompany.map(contactDto),
      sameDomain: sameDomain.map(contactDto),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load related contacts");
    res.status(500).json({ error: "Failed to load related contacts" });
  }
});

router.put("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateContactParams.safeParse(req.params);
  const body = UpdateContactBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  try {
    const { tags, ...rest } = body.data;
    if (rest.companyId) {
      const [own] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(
          and(eq(companiesTable.id, rest.companyId), eq(companiesTable.orgId, r.orgId)),
        );
      if (!own) {
        res.status(400).json({ error: "Invalid companyId" });
        return;
      }
    }
    const update: Record<string, unknown> = { ...rest };
    if (rest.email !== undefined) update.emailNormalized = normalizeEmail(rest.email);
    if (rest.phone !== undefined) update.phoneNormalized = normalizePhone(rest.phone);
    if (tags !== undefined) update.tags = tags;
    const [row] = await db
      .update(contactsTable)
      .set(update)
      .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(UpdateContactResponse.parse(contactDto(row)));
  } catch (err) {
    req.log.error({ err }, "Failed to update contact");
    res.status(500).json({ error: "Failed to update contact" });
  }
});

// PATCH /contacts/:id — partial update, currently used for notes-only auto-save
router.patch("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const id = String(req.params.id);
  const notes = typeof req.body.notes === "string" ? req.body.notes : null;
  try {
    const [row] = await db
      .update(contactsTable)
      .set({ notes })
      .where(and(eq(contactsTable.id, id), eq(contactsTable.orgId, r.orgId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json({ success: true, notes: row.notes });
  } catch (err) {
    req.log.error({ err }, "Failed to patch contact notes");
    res.status(500).json({ error: "Failed to update notes" });
  }
});

router.delete("/contacts/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = DeleteContactParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const [row] = await db
      .delete(contactsTable)
      .where(and(eq(contactsTable.id, params.data.id), eq(contactsTable.orgId, r.orgId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.sendStatus(204);
  } catch (err) {
    req.log.error({ err }, "Failed to delete contact");
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

// Soft-merge two contacts. Older = primary; newer becomes duplicate; reassign leads.
router.post("/contacts/merge", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const primaryId = String(req.body?.primaryId ?? "");
  const duplicateId = String(req.body?.duplicateId ?? "");
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "manual-merge";
  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    res.status(400).json({ error: "primaryId and duplicateId required and must differ" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.orgId, r.orgId),
          inArray(contactsTable.id, [primaryId, duplicateId]),
        ),
      );
    const primary = rows.find((x) => x.id === primaryId);
    const dup = rows.find((x) => x.id === duplicateId);
    if (!primary || !dup) {
      res.status(404).json({ error: "Contact(s) not found" });
      return;
    }
    if (dup.isDuplicate) {
      res.status(409).json({ error: "Duplicate contact is already merged" });
      return;
    }
    if (primary.isDuplicate) {
      res.status(409).json({ error: "Primary contact is itself a merged duplicate" });
      return;
    }

    // Reassign leads + interactions are reachable through leads, so leads update is enough.
    await db
      .update(leadsTable)
      .set({ contactId: primary.id })
      .where(and(eq(leadsTable.orgId, r.orgId), eq(leadsTable.contactId, dup.id)));

    // Backfill primary's contact info from duplicate where missing.
    const patch: Record<string, unknown> = {};
    if (!primary.email && dup.email) {
      patch.email = dup.email;
      patch.emailNormalized = normalizeEmail(dup.email);
    }
    if (!primary.phone && dup.phone) {
      patch.phone = dup.phone;
      patch.phoneNormalized = normalizePhone(dup.phone);
    }
    if (!primary.title && dup.title) patch.title = dup.title;
    if (!primary.companyId && dup.companyId) patch.companyId = dup.companyId;
    if (Object.keys(patch).length > 0) {
      await db.update(contactsTable).set(patch).where(eq(contactsTable.id, primary.id));
    }

    // Soft-delete the duplicate. Null its email/phone normalized to free the
    // partial unique index, since the canonical info now lives on primary.
    const [merged] = await db
      .update(contactsTable)
      .set({
        isDuplicate: true,
        duplicateOf: primary.id,
        mergedAt: new Date(),
        mergedReason: reason,
        emailNormalized: null,
        phoneNormalized: null,
      })
      .where(eq(contactsTable.id, dup.id))
      .returning();

    res.json({
      success: true,
      primary: contactDto(primary),
      duplicate: contactDto(merged),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to merge contacts");
    res.status(500).json({ error: "Failed to merge contacts" });
  }
});

// Find candidate duplicate clusters across the org (same normalized email or phone).
router.post("/contacts/deduplicate", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const apply = req.body?.apply === true;
  try {
    // Email clusters
    const emailGroups = await db
      .select({
        key: sql<string>`lower(${contactsTable.email})`,
        ids: sql<string[]>`array_agg(${contactsTable.id} order by ${contactsTable.createdAt})`,
        count: sql<number>`count(*)::int`,
      })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.orgId, r.orgId),
          eq(contactsTable.isDuplicate, false),
          isNotNull(contactsTable.email),
        ),
      )
      .groupBy(sql`lower(${contactsTable.email})`)
      .having(sql`count(*) > 1`);

    // Phone clusters
    const phoneGroups = await db
      .select({
        key: contactsTable.phoneNormalized,
        ids: sql<string[]>`array_agg(${contactsTable.id} order by ${contactsTable.createdAt})`,
        count: sql<number>`count(*)::int`,
      })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.orgId, r.orgId),
          eq(contactsTable.isDuplicate, false),
          isNotNull(contactsTable.phoneNormalized),
        ),
      )
      .groupBy(contactsTable.phoneNormalized)
      .having(sql`count(*) > 1`);

    const clusters = [
      ...emailGroups.map((g) => ({ field: "email" as const, key: g.key, ids: g.ids })),
      ...phoneGroups.map((g) => ({ field: "phone" as const, key: g.key!, ids: g.ids })),
    ];

    let merged = 0;
    if (apply) {
      for (const cluster of clusters) {
        const [primary, ...rest] = cluster.ids;
        for (const dupId of rest) {
          if (!dupId || dupId === primary) continue;
          // Skip if dup already merged (could happen across email+phone overlap).
          const [existing] = await db
            .select({ isDuplicate: contactsTable.isDuplicate })
            .from(contactsTable)
            .where(eq(contactsTable.id, dupId));
          if (!existing || existing.isDuplicate) continue;
          await db
            .update(leadsTable)
            .set({ contactId: primary })
            .where(and(eq(leadsTable.orgId, r.orgId), eq(leadsTable.contactId, dupId)));
          await db
            .update(contactsTable)
            .set({
              isDuplicate: true,
              duplicateOf: primary,
              mergedAt: new Date(),
              mergedReason: `auto-dedupe(${cluster.field})`,
              emailNormalized: null,
              phoneNormalized: null,
            })
            .where(eq(contactsTable.id, dupId));
          merged++;
        }
      }
    }

    res.json({
      clusters: clusters.map((c) => ({ field: c.field, key: c.key, ids: c.ids })),
      totalClusters: clusters.length,
      mergedCount: merged,
      applied: apply,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to compute duplicates");
    res.status(500).json({ error: "Failed to compute duplicates" });
  }
});

// Backfill route: assign customer numbers + normalize email/phone for legacy rows.
// Idempotent. Useful right after the schema migration.
router.post("/contacts/backfill", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const rows = await db
      .select({
        id: contactsTable.id,
        email: contactsTable.email,
        phone: contactsTable.phone,
        customerNo: contactsTable.customerNo,
        emailNormalized: contactsTable.emailNormalized,
        phoneNormalized: contactsTable.phoneNormalized,
      })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.orgId, r.orgId),
          eq(contactsTable.isDuplicate, false),
        ),
      )
      .orderBy(asc(contactsTable.createdAt));

    let assigned = 0;
    let normalized = 0;
    for (const row of rows) {
      const patch: Record<string, unknown> = {};
      if (!row.customerNo) {
        patch.customerNo = await assignCustomerNo(r.orgId);
        assigned++;
      }
      const en = normalizeEmail(row.email);
      const pn = normalizePhone(row.phone);
      if (en !== row.emailNormalized) {
        patch.emailNormalized = en;
        normalized++;
      }
      if (pn !== row.phoneNormalized) {
        patch.phoneNormalized = pn;
        normalized++;
      }
      if (Object.keys(patch).length > 0) {
        await db.update(contactsTable).set(patch).where(eq(contactsTable.id, row.id));
      }
    }
    res.json({ totalScanned: rows.length, customerNosAssigned: assigned, normalized });
  } catch (err) {
    req.log.error({ err }, "Backfill failed");
    res.status(500).json({ error: "Backfill failed" });
  }
});

void formatCustomerNo;

router.get("/contacts/:id/chat-sessions", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const contactId = String(req.params.id);

  const [contact] = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(and(eq(contactsTable.id, contactId), eq(contactsTable.orgId, r.orgId)))
    .limit(1);

  if (!contact) {
    res.status(404).json({ error: "Contact not found" });
    return;
  }

  const sessions = await db
    .select({ id: chatSessionsTable.id, createdAt: chatSessionsTable.createdAt })
    .from(chatSessionsTable)
    .where(and(eq(chatSessionsTable.orgId, r.orgId), eq(chatSessionsTable.contactId, contactId)))
    .orderBy(desc(chatSessionsTable.createdAt))
    .limit(20);

  const result = await Promise.all(
    sessions.map(async (s) => {
      const [firstMsg] = await db
        .select({ content: chatMessagesTable.content })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.sessionId, s.id), eq(chatMessagesTable.role, "user")))
        .orderBy(asc(chatMessagesTable.createdAt))
        .limit(1);
      return {
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        preview: firstMsg?.content?.slice(0, 120) ?? null,
      };
    }),
  );

  res.json(result);
});

export default router;
