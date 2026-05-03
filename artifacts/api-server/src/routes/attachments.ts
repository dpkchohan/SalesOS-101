import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  chatAttachmentsTable,
  contactsTable,
  companiesTable,
  leadsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { assignCustomerNo, normalizePhone } from "../lib/dedup";
import { objectStorageClient } from "../lib/objectStorage";
import {
  extractAttachment,
  classifyAttachment,
  MAX_ATTACHMENT_BYTES,
  type ExtractedContact,
  type ExtractedData,
  type ExtractedLead,
} from "../lib/attachmentExtract";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

function handleUpload(field: string) {
  const mw = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res
            .status(413)
            .json({ error: "File too large. Attachments must be 10 MB or less." });
          return;
        }
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      res.status(400).json({ error: "Upload failed" });
    });
  };
}

function privateBucketAndPrefix(): { bucketName: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const path = dir.startsWith("/") ? dir.slice(1) : dir;
  const [bucketName, ...rest] = path.split("/");
  return { bucketName, prefix: rest.join("/") };
}

function attachmentDto(row: typeof chatAttachmentsTable.$inferSelect) {
  return {
    id: row.id,
    fileName: row.fileName,
    fileType: row.fileType,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    storageKey: row.storageKey,
    extractionStatus: row.extractionStatus,
    extractedData: (row.extractedData as ExtractedData | null) ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.post(
  "/attachments/upload",
  requireAuth,
  handleUpload("file"),
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest & Request & { file?: Express.Multer.File };
    if (!r.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const kind = classifyAttachment(r.file.mimetype, r.file.originalname);
    if (!kind) {
      res.status(400).json({
        error:
          "Unsupported file type. Send an image (JPG/PNG/WebP), PDF, DOCX, PPTX, XLSX, CSV, or TXT.",
      });
      return;
    }

    const { bucketName, prefix } = privateBucketAndPrefix();
    const objectId = randomUUID();
    const safeName = r.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectName = [prefix, "chat-attachments", r.orgId, `${objectId}-${safeName}`]
      .filter(Boolean)
      .join("/");

    try {
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(r.file.buffer, {
        contentType: r.file.mimetype,
        resumable: false,
        metadata: {
          contentType: r.file.mimetype,
          metadata: { orgId: r.orgId, uploadedBy: r.userId, originalName: r.file.originalname },
        },
      });
    } catch (err) {
      req.log.error({ err }, "Chat attachment storage upload failed");
      res.status(500).json({ error: "Could not store the attachment. Try again." });
      return;
    }

    const [created] = await db
      .insert(chatAttachmentsTable)
      .values({
        orgId: r.orgId,
        uploadedBy: r.userId,
        fileName: r.file.originalname,
        fileType: kind,
        mimeType: r.file.mimetype,
        fileSize: r.file.size,
        storageKey: objectName,
        extractionStatus: "pending",
      })
      .returning();

    res.json(attachmentDto(created));
  },
);

router.get(
  "/attachments/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const [row] = await db
      .select()
      .from(chatAttachmentsTable)
      .where(
        and(
          eq(chatAttachmentsTable.id, String(req.params.id)),
          eq(chatAttachmentsTable.orgId, r.orgId),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    res.json(attachmentDto(row));
  },
);

router.post(
  "/attachments/:id/extract",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const [row] = await db
      .select()
      .from(chatAttachmentsTable)
      .where(
        and(
          eq(chatAttachmentsTable.id, id),
          eq(chatAttachmentsTable.orgId, r.orgId),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (row.extractionStatus === "done") {
      res.json(attachmentDto(row));
      return;
    }

    const [marked] = await db
      .update(chatAttachmentsTable)
      .set({ extractionStatus: "running", error: null })
      .where(eq(chatAttachmentsTable.id, id))
      .returning();
    res.json(attachmentDto(marked));

    // Process in the background; the frontend polls GET /attachments/:id
    void runExtraction(id, row.storageKey, row.mimeType, row.fileName, req.log).catch(
      (err) => {
        req.log.error({ err, id }, "attachment extraction crashed");
      },
    );
  },
);

async function runExtraction(
  attachmentId: string,
  storageKey: string,
  mimeType: string,
  fileName: string,
  log: { error: (...a: unknown[]) => void },
): Promise<void> {
  try {
    const { bucketName } = privateBucketAndPrefix();
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(storageKey);
    const [buf] = await file.download();
    const data = await extractAttachment(buf, mimeType, fileName);
    await db
      .update(chatAttachmentsTable)
      .set({
        extractionStatus: "done",
        extractedData: data,
        error: data.contacts.length === 0 ? "No contact info found" : null,
      })
      .where(eq(chatAttachmentsTable.id, attachmentId));
  } catch (err) {
    log.error({ err, attachmentId }, "extractAttachment failed");
    await db
      .update(chatAttachmentsTable)
      .set({
        extractionStatus: "failed",
        error: err instanceof Error ? err.message : "Extraction failed",
      })
      .where(eq(chatAttachmentsTable.id, attachmentId));
  }
}

interface ApplyBody {
  action: "contact" | "lead";
  contactIndex?: number;
  overrides?: Partial<ExtractedContact> & {
    stage?: string | null;
    valueUsd?: number | null;
    closeDate?: string | null;
  };
}

interface ApplyResultEntry {
  contactId: string;
  contactName: string;
  leadId: string | null;
  merged: boolean;
  email: string | null;
}

async function getOrCreateCompany(orgId: string, name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  const existing = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(
      and(
        eq(companiesTable.orgId, orgId),
        sql`lower(${companiesTable.name}) = ${key}`,
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(companiesTable)
    .values({ orgId, name: name.trim() })
    .returning({ id: companiesTable.id });
  return created.id;
}

function findLead(contacts: ExtractedContact[], leads: ExtractedLead[], idx: number) {
  const c = contacts[idx];
  if (!c) return null;
  return (
    leads.find(
      (l) =>
        l.contactName.toLowerCase() === (c.name || "").toLowerCase() ||
        (c.email && l.contactName.toLowerCase() === c.email.toLowerCase()),
    ) ?? null
  );
}

router.post(
  "/attachments/:id/apply",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const body = req.body as ApplyBody;
    if (body?.action !== "contact" && body?.action !== "lead") {
      res.status(400).json({ error: "action must be 'contact' or 'lead'" });
      return;
    }
    const [row] = await db
      .select()
      .from(chatAttachmentsTable)
      .where(
        and(
          eq(chatAttachmentsTable.id, id),
          eq(chatAttachmentsTable.orgId, r.orgId),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }
    if (row.extractionStatus !== "done" || !row.extractedData) {
      res.status(400).json({ error: "Attachment is not ready yet" });
      return;
    }
    const data = row.extractedData as ExtractedData;
    if (data.contacts.length === 0) {
      res.status(400).json({ error: "No contacts to add from this attachment" });
      return;
    }

    const indices =
      typeof body.contactIndex === "number"
        ? [body.contactIndex]
        : data.contacts.map((_, i) => i);

    const results: ApplyResultEntry[] = [];

    for (const idx of indices) {
      const base = data.contacts[idx];
      if (!base) continue;
      const overrides = indices.length === 1 ? body.overrides ?? {} : {};
      const merged: ExtractedContact = {
        name: (overrides.name ?? base.name ?? "").trim() || (base.email ?? "Unnamed Contact"),
        email: (overrides.email ?? base.email)?.toString().trim().toLowerCase() || null,
        phone: (overrides.phone ?? base.phone)?.toString().trim() || null,
        title: (overrides.title ?? base.title)?.toString().trim() || null,
        company: (overrides.company ?? base.company)?.toString().trim() || null,
        notes: (overrides.notes ?? base.notes) ?? null,
      };

      const companyId = merged.company
        ? await getOrCreateCompany(r.orgId, merged.company)
        : null;

      let contactId: string;
      let wasInserted = true;
      const phoneNorm = normalizePhone(merged.phone);
      if (merged.email) {
        const newCustomerNo = await assignCustomerNo(r.orgId);
        const result = await db.execute<{ id: string; was_inserted: boolean }>(sql`
          INSERT INTO contacts (org_id, company_id, customer_no, name, email, email_normalized, phone, phone_normalized, title)
          VALUES (${r.orgId}, ${companyId}, ${newCustomerNo}, ${merged.name}, ${merged.email}, ${merged.email},
                  ${merged.phone}, ${phoneNorm}, ${merged.title})
          ON CONFLICT (org_id, lower(email)) WHERE email IS NOT NULL
          DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
            phone = COALESCE(EXCLUDED.phone, contacts.phone),
            phone_normalized = COALESCE(EXCLUDED.phone_normalized, contacts.phone_normalized),
            title = COALESCE(EXCLUDED.title, contacts.title),
            company_id = COALESCE(EXCLUDED.company_id, contacts.company_id),
            updated_at = NOW()
          RETURNING id, (xmax = 0) AS was_inserted
        `);
        const rrow = result.rows[0];
        contactId = rrow.id;
        wasInserted = !!rrow.was_inserted;
      } else {
        const customerNo = await assignCustomerNo(r.orgId);
        const [created] = await db
          .insert(contactsTable)
          .values({
            orgId: r.orgId,
            companyId,
            customerNo,
            name: merged.name,
            email: null,
            phone: merged.phone,
            phoneNormalized: phoneNorm,
            title: merged.title,
          })
          .returning({ id: contactsTable.id });
        contactId = created.id;
      }

      let leadId: string | null = null;
      if (body.action === "lead") {
        const leadHint = findLead(data.contacts, data.leads, idx);
        const stage =
          (overrides.stage as string | undefined) ??
          (leadHint?.stage as string | undefined) ??
          "new";
        const valueUsd =
          overrides.valueUsd != null
            ? overrides.valueUsd
            : leadHint?.valueUsd ?? null;
        const closeDate =
          (overrides.closeDate as string | undefined) ??
          (leadHint?.closeDate ?? null);
        const [lead] = await db
          .insert(leadsTable)
          .values({
            orgId: r.orgId,
            contactId,
            assignedTo: r.userId,
            stage: stage ?? "new",
            valueUsd: valueUsd ?? null,
            closeDate: closeDate ?? null,
            source: leadHint?.source ?? "chat-attachment",
          })
          .returning({ id: leadsTable.id });
        leadId = lead.id;
      }

      results.push({
        contactId,
        contactName: merged.name,
        leadId,
        merged: !wasInserted,
        email: merged.email,
      });
    }

    res.json({ results });
  },
);

export default router;
