import { Router, type IRouter } from "express";
import * as zod from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, contactsTable, companiesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { assignCustomerNo, normalizePhone } from "../lib/dedup";
import { extractContactsFromFile } from "../lib/importAI";
import {
  getPresignedDownloadUrl,
  deleteFile,
  getFileSize,
  updateStorageUsage,
} from "../lib/storage";

const router: IRouter = Router();

const ExtractBody = zod.object({
  fileKey: zod.string().min(1),
  filename: zod.string().min(1).max(500),
  contentType: zod.string().min(1).max(200),
});

// ── POST /import/extract ──────────────────────────────────────────────────────
// 1. Resolves a presigned GET URL for the uploaded file
// 2. Sends it to Claude for contact extraction
// 3. Upserts contacts + companies into the DB
// 4. Always cleans up the S3 temp file (in finally)
router.post("/import/extract", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;

  const parsed = ExtractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fileKey, filename, contentType } = parsed.data;

  // ── Resolve presigned download URL (validates ownership) ─────────────────
  let downloadUrl: string;
  try {
    const result = await getPresignedDownloadUrl(r.userId, r.orgId, fileKey);
    downloadUrl = result.downloadUrl;
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode === 403) {
      res.status(403).json({ error: e.message });
    } else {
      req.log.error({ err }, "import/extract: failed to resolve download URL");
      res.status(500).json({ error: "Could not access the uploaded file" });
    }
    return;
  }

  try {
    // ── Claude extraction ────────────────────────────────────────────────────
    const extraction = await extractContactsFromFile(downloadUrl, filename, contentType);

    if ("error" in extraction) {
      res.status(422).json({ error: extraction.error });
      return;
    }

    const { contacts: rawContacts, organizations: rawOrgs } = extraction;
    const errors: string[] = [];
    let contactsCreated = 0;
    let organizationsCreated = 0;

    // ── Company cache (find-or-create) ───────────────────────────────────────
    const companyCache = new Map<string, string>();

    async function getOrCreateCompany(
      name: string,
      industry?: string,
      website?: string,
    ): Promise<string> {
      const key = name.trim().toLowerCase();
      const hit = companyCache.get(key);
      if (hit) return hit;

      const [existing] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(
          and(
            eq(companiesTable.orgId, r.orgId),
            sql`lower(${companiesTable.name}) = ${key}`,
          ),
        )
        .limit(1);

      if (existing) {
        companyCache.set(key, existing.id);
        return existing.id;
      }

      const [created] = await db
        .insert(companiesTable)
        .values({
          orgId: r.orgId,
          name: name.trim(),
          industry: industry ?? null,
          website: website ?? null,
        })
        .returning({ id: companiesTable.id });

      organizationsCreated++;
      companyCache.set(key, created.id);
      return created.id;
    }

    // Pre-seed cache from the organisations Claude extracted
    for (const org of rawOrgs) {
      if (!org.name?.trim()) continue;
      try {
        await getOrCreateCompany(org.name, org.industry, org.website);
      } catch (err) {
        errors.push(
          `Organization "${org.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    const seen = new Set<string>();

    for (const raw of rawContacts) {
      const name = raw.name?.trim();
      if (!name) {
        errors.push("Skipped a contact with no name");
        continue;
      }

      const email = raw.email?.trim() || null;
      const phone = raw.phone?.trim() || null;
      const phoneNorm = normalizePhone(phone);
      const tags = Array.isArray(raw.tags)
        ? raw.tags.filter((t): t is string => typeof t === "string" && Boolean(t))
        : [];
      const title = raw.title?.trim() || null;

      // Within-batch dedup
      const dedupeKey = email ?? `${name.toLowerCase()}|${phoneNorm ?? ""}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      try {
        const companyId = raw.company?.trim()
          ? await getOrCreateCompany(raw.company.trim())
          : null;

        if (email) {
          // ── Email upsert (atomic, race-safe) ─────────────────────────────
          // Same pattern as importAi.ts — raw SQL ON CONFLICT on the partial
          // unique index (org_id, lower(email)) WHERE email IS NOT NULL.
          const customerNo = await assignCustomerNo(r.orgId);
          const result = await db.execute<{ id: string; was_inserted: boolean }>(sql`
            INSERT INTO contacts (org_id, company_id, customer_no, name, email,
                                  email_normalized, phone, phone_normalized, title)
            VALUES (${r.orgId}, ${companyId}, ${customerNo}, ${name}, ${email},
                    ${email}, ${phone}, ${phoneNorm}, ${title})
            ON CONFLICT (org_id, lower(email))
              WHERE email IS NOT NULL AND is_duplicate = false
            DO UPDATE SET
              name             = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
              phone            = COALESCE(EXCLUDED.phone, contacts.phone),
              phone_normalized = COALESCE(EXCLUDED.phone_normalized, contacts.phone_normalized),
              title            = COALESCE(EXCLUDED.title, contacts.title),
              company_id       = COALESCE(EXCLUDED.company_id, contacts.company_id),
              updated_at       = NOW()
            RETURNING id, (xmax = 0) AS was_inserted
          `);
          const row = result.rows[0];
          if (row.was_inserted) contactsCreated++;

          // Update tags via typed ORM (safe array binding)
          if (tags.length > 0) {
            await db
              .update(contactsTable)
              .set({ tags })
              .where(eq(contactsTable.id, row.id));
          }
        } else if (phoneNorm) {
          // ── Phone-only dedup ──────────────────────────────────────────────
          const [existing] = await db
            .select({ id: contactsTable.id })
            .from(contactsTable)
            .where(
              and(
                eq(contactsTable.orgId, r.orgId),
                eq(contactsTable.isDuplicate, false),
                eq(contactsTable.phoneNormalized, phoneNorm),
              ),
            )
            .limit(1);

          if (existing) {
            await db
              .update(contactsTable)
              .set({
                name: name || undefined,
                title: title || undefined,
                companyId: companyId ?? undefined,
                ...(tags.length > 0 ? { tags } : {}),
              })
              .where(eq(contactsTable.id, existing.id));
          } else {
            const customerNo = await assignCustomerNo(r.orgId);
            await db.insert(contactsTable).values({
              orgId: r.orgId,
              companyId,
              customerNo,
              name,
              phone,
              phoneNormalized: phoneNorm,
              title,
              tags,
            });
            contactsCreated++;
          }
        } else {
          // ── Name-only contact ─────────────────────────────────────────────
          const customerNo = await assignCustomerNo(r.orgId);
          await db.insert(contactsTable).values({
            orgId: r.orgId,
            companyId,
            customerNo,
            name,
            title,
            tags,
          });
          contactsCreated++;
        }
      } catch (err) {
        errors.push(
          `Contact "${name}": ${err instanceof Error ? err.message : String(err)}`,
        );
        req.log.error({ err, name }, "import/extract: contact insert failed");
      }
    }

    res.json({
      created: { contacts: contactsCreated, organizations: organizationsCreated },
      errors,
    });
  } finally {
    // Always delete the temp file — success or failure
    try {
      const fileSize = await getFileSize(r.userId, r.orgId, fileKey);
      await deleteFile(r.userId, r.orgId, fileKey);
      if (fileSize > 0) await updateStorageUsage(r.userId, r.orgId, -fileSize);
    } catch (cleanupErr) {
      req.log.error({ err: cleanupErr, fileKey }, "import/extract: S3 cleanup failed");
    }
  }
});

export default router;
