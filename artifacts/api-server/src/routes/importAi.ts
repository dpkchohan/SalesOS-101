import {
  Router,
  type IRouter,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import multer, { MulterError } from "multer";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";

async function cleanupJobFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    /* ignore */
  }
}
import {
  db,
  importJobsTable,
  contactsTable,
  companiesTable,
  leadsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  parseSmartFile,
  analyzePreview,
  extractBatch,
  normalizeContact,
  type SmartContact,
  type ParsedRow,
} from "../lib/smartImport";

const router: IRouter = Router();

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BATCH_SIZE = 500;
const MAX_CONCURRENT_BATCHES = 2;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

function handleUpload(field: string) {
  const mw = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large. Max 50 MB." });
          return;
        }
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      res.status(400).json({ error: "Upload failed" });
    });
  };
}

function jobStorageDir(): string {
  return path.join(os.tmpdir(), "salesos-import-jobs");
}

async function saveJobFile(jobId: string, filename: string, buf: Buffer): Promise<string> {
  const dir = jobStorageDir();
  await fs.mkdir(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fp = path.join(dir, `${jobId}__${safe}`);
  await fs.writeFile(fp, buf);
  return fp;
}

async function loadJobFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

function summaryFromJob(job: typeof importJobsTable.$inferSelect) {
  return {
    id: job.id,
    filename: job.filename,
    status: job.status,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    contactsCreated: job.contactsCreated,
    contactsUpdated: job.contactsUpdated,
    leadsCreated: job.leadsCreated,
    companiesCreated: job.companiesCreated,
    skipped: job.skipped,
    totalBatches: job.totalBatches,
    completedBatches: job.completedBatches,
    preview: job.preview ?? null,
    errorLog: Array.isArray(job.errorLog) ? job.errorLog : [],
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  };
}

router.post(
  "/import/ai-smart/preview",
  requireAuth,
  handleUpload("file"),
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest & Request & { file?: Express.Multer.File };
    if (!r.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    let parsed;
    try {
      parsed = parseSmartFile(r.file.buffer, r.file.originalname);
    } catch (err) {
      req.log.error({ err }, "Smart import parse failed");
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Could not parse file. Upload a valid CSV, Excel, or JSON file.",
      });
      return;
    }
    if (parsed.rows.length === 0) {
      res.status(400).json({ error: "File contains no data rows." });
      return;
    }

    const jobId = randomUUID();
    let filePath: string | null = null;
    try {
      filePath = await saveJobFile(jobId, r.file.originalname, r.file.buffer);
    } catch (err) {
      req.log.error({ err }, "Saving import file failed");
      res.status(500).json({ error: "Could not save uploaded file." });
      return;
    }

    const analysis = await analyzePreview(r.file.originalname, parsed);

    const totalBatches = Math.max(1, Math.ceil(parsed.rows.length / BATCH_SIZE));
    const [created] = await db
      .insert(importJobsTable)
      .values({
        id: jobId,
        orgId: r.orgId,
        createdBy: r.userId,
        filename: r.file.originalname,
        fileSize: r.file.size,
        filePath,
        status: "preview",
        totalRows: parsed.rows.length,
        totalBatches,
        preview: analysis,
      })
      .returning();

    res.json(summaryFromJob(created));
  },
);

router.post(
  "/import/ai-smart/execute",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const jobId = String(req.body?.jobId ?? "").trim();
    if (!jobId) {
      res.status(400).json({ error: "jobId is required" });
      return;
    }
    const [job] = await db
      .select()
      .from(importJobsTable)
      .where(and(eq(importJobsTable.id, jobId), eq(importJobsTable.orgId, r.orgId)))
      .limit(1);
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    if (job.status !== "preview") {
      res.json(summaryFromJob(job));
      return;
    }

    const [updated] = await db
      .update(importJobsTable)
      .set({ status: "processing" })
      .where(eq(importJobsTable.id, jobId))
      .returning();

    queueJobBatches(jobId, job.totalBatches, req.log).catch((err) => {
      req.log.error({ err, jobId }, "Background import job queueing failed");
    });

    res.json(summaryFromJob(updated));
  },
);

router.get(
  "/import/ai-smart/job/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const id = String(req.params.id);
    const [job] = await db
      .select()
      .from(importJobsTable)
      .where(and(eq(importJobsTable.id, id), eq(importJobsTable.orgId, r.orgId)))
      .limit(1);
    if (!job) {
      res.status(404).json({ error: "Import job not found" });
      return;
    }
    res.json(summaryFromJob(job));
  },
);

router.post(
  "/import/ai-smart/worker",
  async (req, res): Promise<void> => {
    const expected = process.env.INTERNAL_WORKER_KEY;
    const provided = req.headers["x-internal-worker"];
    if (!expected || typeof provided !== "string" || provided !== expected) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const jobId = String(req.body?.jobId ?? "");
    const batchIndex = Number(req.body?.batchIndex ?? -1);
    if (!jobId || !Number.isInteger(batchIndex) || batchIndex < 0) {
      res.status(400).json({ error: "jobId and batchIndex required" });
      return;
    }
    try {
      await processBatch(jobId, batchIndex, req.log);
      res.json({ ok: true });
    } catch (err) {
      req.log.error({ err, jobId, batchIndex }, "Worker batch failed");
      res.status(500).json({ error: "Batch failed" });
    }
  },
);

// In-process worker queue with concurrency cap.
async function queueJobBatches(
  jobId: string,
  totalBatches: number,
  log: { error: (...a: unknown[]) => void },
): Promise<void> {
  let next = 0;
  let active = 0;
  const fatalErrors: unknown[] = [];
  await new Promise<void>((resolve) => {
    const launchNext = () => {
      while (active < MAX_CONCURRENT_BATCHES && next < totalBatches) {
        const batchIndex = next++;
        active++;
        processBatch(jobId, batchIndex, log)
          .catch(async (err) => {
            log.error({ err, jobId, batchIndex }, "Batch processing failed");
            fatalErrors.push(err);
            // Still mark this batch as "done" so totals advance and the job
            // can reach a terminal state instead of hanging in processing.
            try {
              await markBatchDone(jobId, 0, 0, 0, 0, 0, [
                {
                  batch: batchIndex + 1,
                  reason: err instanceof Error ? err.message : "Batch failed",
                },
              ]);
            } catch (markErr) {
              log.error({ err: markErr, jobId, batchIndex }, "markBatchDone failed");
            }
          })
          .finally(() => {
            active--;
            if (next >= totalBatches && active === 0) resolve();
            else launchNext();
          });
      }
      if (totalBatches === 0) resolve();
    };
    launchNext();
  });

  // If every batch failed and nothing was processed, mark the job failed.
  if (fatalErrors.length === totalBatches && totalBatches > 0) {
    try {
      const [job] = await db
        .select()
        .from(importJobsTable)
        .where(eq(importJobsTable.id, jobId))
        .limit(1);
      if (job && job.status !== "completed") {
        await db
          .update(importJobsTable)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(importJobsTable.id, jobId));
        await cleanupJobFile(job.filePath);
      }
    } catch (err) {
      log.error({ err, jobId }, "Failed to mark job as failed");
    }
  }
}

interface BatchError {
  batch: number;
  row?: number;
  reason: string;
}

async function processBatch(
  jobId: string,
  batchIndex: number,
  log: { error: (...a: unknown[]) => void },
): Promise<void> {
  const [job] = await db
    .select()
    .from(importJobsTable)
    .where(eq(importJobsTable.id, jobId))
    .limit(1);
  if (!job || !job.filePath) return;

  const buf = await loadJobFile(job.filePath);
  const parsed = parseSmartFile(buf, job.filename);
  const start = batchIndex * BATCH_SIZE;
  const slice = parsed.rows.slice(start, start + BATCH_SIZE);
  if (slice.length === 0) {
    await markBatchDone(jobId, 0, 0, 0, 0, 0, []);
    return;
  }

  const batchErrors: BatchError[] = [];
  const { contacts, warnings } = await extractBatch(slice as ParsedRow[], parsed.headers);
  for (const w of warnings) {
    batchErrors.push({ batch: batchIndex + 1, reason: w });
  }

  let contactsCreated = 0;
  let contactsUpdated = 0;
  let leadsCreated = 0;
  let companiesCreated = 0;
  let skipped = 0;

  const companyCache = new Map<string, string>();
  async function getOrCreateCompany(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    const cached = companyCache.get(key);
    if (cached) return cached;
    const existing = await db
      .select({ id: companiesTable.id })
      .from(companiesTable)
      .where(
        and(
          eq(companiesTable.orgId, job.orgId),
          sql`lower(${companiesTable.name}) = ${key}`,
        ),
      )
      .limit(1);
    if (existing[0]) {
      companyCache.set(key, existing[0].id);
      return existing[0].id;
    }
    const [created] = await db
      .insert(companiesTable)
      .values({ orgId: job.orgId, name: name.trim() })
      .returning({ id: companiesTable.id });
    companiesCreated++;
    companyCache.set(key, created.id);
    return created.id;
  }

  // Dedupe within the batch by email
  const seen = new Set<string>();
  const ordered: SmartContact[] = [];
  for (const raw of contacts) {
    const c = normalizeContact(raw);
    if (!c.name && !c.email) {
      skipped++;
      batchErrors.push({ batch: batchIndex + 1, reason: "Row has no name or email" });
      continue;
    }
    const key = c.email ?? `${c.name.toLowerCase()}|${c.phone ?? ""}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    ordered.push(c);
  }

  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    try {
      const companyId = c.company ? await getOrCreateCompany(c.company) : null;

      let contactId: string | null = null;
      if (c.email) {
        // Race-safe upsert keyed on the partial unique index
        // (org_id, lower(email)) WHERE email IS NOT NULL.
        // Drizzle's typed builder can't express expressional conflict targets,
        // so we drop to raw SQL. xmax=0 lets us tell INSERT vs UPDATE.
        const contactName = c.name || c.email || "Unnamed Contact";
        const result = await db.execute<{ id: string; was_inserted: boolean }>(sql`
          INSERT INTO contacts (org_id, company_id, name, email, phone, title, import_job_id)
          VALUES (${job.orgId}, ${companyId}, ${contactName}, ${c.email},
                  ${c.phone ?? null}, ${c.title ?? null}, ${job.id})
          ON CONFLICT (org_id, lower(email)) WHERE email IS NOT NULL
          DO UPDATE SET
            name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
            phone = COALESCE(EXCLUDED.phone, contacts.phone),
            title = COALESCE(EXCLUDED.title, contacts.title),
            company_id = COALESCE(EXCLUDED.company_id, contacts.company_id),
            import_job_id = EXCLUDED.import_job_id,
            updated_at = NOW()
          RETURNING id, (xmax = 0) AS was_inserted
        `);
        const row = result.rows[0];
        contactId = row.id;
        if (row.was_inserted) contactsCreated++;
        else contactsUpdated++;
      } else {
        const [created] = await db
          .insert(contactsTable)
          .values({
            orgId: job.orgId,
            companyId,
            name: c.name || "Unnamed Contact",
            email: null,
            phone: c.phone,
            title: c.title,
            importJobId: job.id,
          })
          .returning({ id: contactsTable.id });
        contactId = created.id;
        contactsCreated++;
      }

      if (c.stage) {
        const existingLead = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(
            and(
              eq(leadsTable.orgId, job.orgId),
              eq(leadsTable.contactId, contactId),
            ),
          )
          .limit(1);
        if (existingLead[0]) {
          await db
            .update(leadsTable)
            .set({
              stage: c.stage,
              valueUsd: c.valueUsd ?? undefined,
              closeDate: c.closeDate ?? undefined,
              source: "ai-import",
              importJobId: job.id,
            })
            .where(eq(leadsTable.id, existingLead[0].id));
        } else {
          await db.insert(leadsTable).values({
            orgId: job.orgId,
            contactId,
            assignedTo: job.createdBy,
            stage: c.stage,
            valueUsd: c.valueUsd,
            closeDate: c.closeDate,
            source: "ai-import",
            importJobId: job.id,
          });
          leadsCreated++;
        }
      }
    } catch (err) {
      skipped++;
      batchErrors.push({
        batch: batchIndex + 1,
        row: start + i + 2,
        reason: err instanceof Error ? err.message : "Insert failed",
      });
      log.error({ err, jobId, row: start + i + 2 }, "Smart import row failed");
    }
  }

  await markBatchDone(
    jobId,
    slice.length,
    contactsCreated,
    contactsUpdated,
    leadsCreated,
    companiesCreated,
    batchErrors,
    skipped,
  );
}

async function markBatchDone(
  jobId: string,
  processedRows: number,
  contactsCreated: number,
  contactsUpdated: number,
  leadsCreated: number,
  companiesCreated: number,
  errors: BatchError[],
  skipped = 0,
): Promise<void> {
  const errorJson = JSON.stringify(errors);
  // Atomic SQL increments + array append — safe under concurrent batch writes.
  // We update completedBatches via the existing column to avoid a race in the
  // caller, and let the DB compute the new status in a follow-up read.
  const [updated] = await db
    .update(importJobsTable)
    .set({
      processedRows: sql`${importJobsTable.processedRows} + ${processedRows}`,
      contactsCreated: sql`${importJobsTable.contactsCreated} + ${contactsCreated}`,
      contactsUpdated: sql`${importJobsTable.contactsUpdated} + ${contactsUpdated}`,
      leadsCreated: sql`${importJobsTable.leadsCreated} + ${leadsCreated}`,
      companiesCreated: sql`${importJobsTable.companiesCreated} + ${companiesCreated}`,
      skipped: sql`${importJobsTable.skipped} + ${skipped}`,
      completedBatches: sql`${importJobsTable.completedBatches} + 1`,
      errorLog: sql`(COALESCE(${importJobsTable.errorLog}, '[]'::jsonb) || ${errorJson}::jsonb)`,
    })
    .where(eq(importJobsTable.id, jobId))
    .returning();

  if (updated && updated.completedBatches >= updated.totalBatches && updated.status !== "completed") {
    await db
      .update(importJobsTable)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(importJobsTable.id, jobId));
    await cleanupJobFile(updated.filePath);
  }
}

export default router;
