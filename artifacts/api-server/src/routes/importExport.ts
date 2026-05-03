import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  contactsTable,
  companiesTable,
  leadsTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { assignCustomerNo, normalizeEmail, normalizePhone } from "../lib/dedup";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleUpload(field: string) {
  const mw = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    mw(req, res, (err: unknown) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large. Max 10 MB." });
          return;
        }
        res.status(400).json({ error: `Upload error: ${err.message}` });
        return;
      }
      res.status(400).json({ error: "Upload failed" });
    });
  };
}

const SALESOS_FIELDS = [
  { id: "name", label: "Full name (auto-built from First+Last)" },
  { id: "first_name", label: "First name" },
  { id: "last_name", label: "Last name" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "company", label: "Company" },
  { id: "title", label: "Job title" },
  { id: "lead_status", label: "Lead status" },
  { id: "value_usd", label: "Deal amount (USD)" },
  { id: "close_date", label: "Close date" },
  { id: "ignore", label: "(do not import)" },
] as const;

type FieldId = (typeof SALESOS_FIELDS)[number]["id"];

const HEADER_HINTS: Record<string, FieldId> = {
  "first name": "first_name",
  firstname: "first_name",
  "given name": "first_name",
  "last name": "last_name",
  lastname: "last_name",
  surname: "last_name",
  "family name": "last_name",
  "full name": "name",
  name: "name",
  "contact name": "name",
  email: "email",
  "email address": "email",
  "primary email": "email",
  "e-mail": "email",
  phone: "phone",
  "phone number": "phone",
  "primary phone": "phone",
  mobile: "phone",
  "mobile number": "phone",
  company: "company",
  "company name": "company",
  organization: "company",
  account: "company",
  title: "title",
  "job title": "title",
  position: "title",
  "lead status": "lead_status",
  status: "lead_status",
  stage: "lead_status",
  "deal stage": "lead_status",
  "deal amount": "value_usd",
  amount: "value_usd",
  value: "value_usd",
  "deal value": "value_usd",
  arr: "value_usd",
  "close date": "close_date",
  "expected close": "close_date",
  "expected close date": "close_date",
  "closing date": "close_date",
};

function suggestMapping(headers: string[]): Record<string, FieldId> {
  const out: Record<string, FieldId> = {};
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    out[h] = HEADER_HINTS[key] ?? "ignore";
  }
  return out;
}

const STATUS_MAP: Record<string, string> = {
  new: "new",
  open: "interested",
  "open deal": "qualified",
  connected: "qualified",
  "attempted to contact": "interested",
  "in progress": "negotiating",
  negotiating: "negotiating",
  proposal: "negotiating",
  qualified: "qualified",
  won: "won",
  "closed won": "won",
  lost: "lost",
  "closed lost": "lost",
  "bad timing": "lost",
  unqualified: "lost",
  interested: "interested",
};

function mapStatus(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase();
  if (!k) return null;
  return STATUS_MAP[k] ?? null;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function cleanPhone(s: string): string {
  return s.replace(/[^\d+]/g, "").trim();
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseDateISO(s: string): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseFile(buffer: Buffer, filename: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  if (aoa.length === 0) return { headers: [], rows: [] };
  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim()).filter((h) => h !== "");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const obj: Record<string, string> = {};
    let any = false;
    for (let j = 0; j < headers.length; j++) {
      const v = row[j];
      const s = v == null ? "" : String(v).trim();
      if (s) any = true;
      obj[headers[j]] = s;
    }
    if (any) rows.push(obj);
  }
  void ext;
  return { headers, rows };
}

router.post(
  "/import/preview",
  requireAuth,
  handleUpload("file"),
  async (req, res): Promise<void> => {
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    try {
      const { headers, rows } = parseFile(file.buffer, file.originalname);
      res.json({
        filename: file.originalname,
        headers,
        rowCount: rows.length,
        sampleRows: rows.slice(0, 5),
        suggestedMapping: suggestMapping(headers),
        salesosFields: SALESOS_FIELDS,
      });
    } catch (err) {
      req.log.error({ err }, "Import preview failed");
      res.status(400).json({ error: "Could not parse file. Please upload a valid CSV or Excel file." });
    }
  },
);

router.post(
  "/import/contacts",
  requireAuth,
  handleUpload("file"),
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest & Request & { file?: Express.Multer.File };
    if (!r.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    let mapping: Record<string, FieldId>;
    try {
      mapping = JSON.parse(String(req.body.mapping ?? "{}"));
    } catch {
      res.status(400).json({ error: "Invalid mapping JSON" });
      return;
    }

    let parsed: { headers: string[]; rows: Record<string, string>[] };
    try {
      parsed = parseFile(r.file.buffer, r.file.originalname);
    } catch (err) {
      req.log.error({ err }, "Import parse failed");
      res.status(400).json({ error: "Could not parse file" });
      return;
    }
    const { rows } = parsed;

    const summary = {
      total: rows.length,
      contactsCreated: 0,
      contactsUpdated: 0,
      leadsCreated: 0,
      companiesCreated: 0,
      skipped: 0,
      errors: [] as { row: number; reason: string }[],
    };

    const companyCache = new Map<string, string>();
    async function getOrCreateCompany(name: string): Promise<string> {
      const key = name.trim();
      const cached = companyCache.get(key.toLowerCase());
      if (cached) return cached;
      const existing = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(and(eq(companiesTable.orgId, r.orgId), sql`lower(${companiesTable.name}) = ${key.toLowerCase()}`))
        .limit(1);
      if (existing[0]) {
        companyCache.set(key.toLowerCase(), existing[0].id);
        return existing[0].id;
      }
      const [created] = await db
        .insert(companiesTable)
        .values({ orgId: r.orgId, name: key })
        .returning({ id: companiesTable.id });
      summary.companiesCreated++;
      companyCache.set(key.toLowerCase(), created.id);
      return created.id;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const get = (field: FieldId): string => {
          for (const [header, mapped] of Object.entries(mapping)) {
            if (mapped === field) return (row[header] ?? "").trim();
          }
          return "";
        };
        const firstName = get("first_name");
        const lastName = get("last_name");
        const fullName = get("name") || [firstName, lastName].filter(Boolean).join(" ").trim();
        const email = get("email").toLowerCase();
        const phoneRaw = get("phone");
        const phone = phoneRaw ? cleanPhone(phoneRaw) : "";
        const companyName = get("company");
        const title = get("title");
        const leadStatus = get("lead_status");
        const valueUsd = parseAmount(get("value_usd"));
        const closeDate = parseDateISO(get("close_date"));

        if (email && !isValidEmail(email)) {
          summary.skipped++;
          summary.errors.push({ row: i + 2, reason: `Invalid email: ${email}` });
          continue;
        }
        const displayName = fullName || email || "Unnamed Contact";
        if (!email && !fullName) {
          summary.skipped++;
          summary.errors.push({ row: i + 2, reason: "Row has neither name nor email" });
          continue;
        }

        const companyId = companyName ? await getOrCreateCompany(companyName) : null;

        const emailNorm = normalizeEmail(email);
        const phoneNorm = normalizePhone(phone);
        let contactId: string | null = null;
        if (emailNorm) {
          const existing = await db
            .select({ id: contactsTable.id })
            .from(contactsTable)
            .where(
              and(
                eq(contactsTable.orgId, r.orgId),
                eq(contactsTable.isDuplicate, false),
                sql`lower(${contactsTable.email}) = ${emailNorm}`,
              ),
            )
            .limit(1);
          if (existing[0]) {
            contactId = existing[0].id;
            await db
              .update(contactsTable)
              .set({
                name: displayName,
                phone: phone || undefined,
                phoneNormalized: phoneNorm ?? undefined,
                title: title || undefined,
                companyId: companyId ?? undefined,
              })
              .where(eq(contactsTable.id, contactId));
            summary.contactsUpdated++;
          }
        } else if (phoneNorm) {
          const existing = await db
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
          if (existing[0]) {
            contactId = existing[0].id;
            await db
              .update(contactsTable)
              .set({
                name: displayName,
                title: title || undefined,
                companyId: companyId ?? undefined,
              })
              .where(eq(contactsTable.id, contactId));
            summary.contactsUpdated++;
          }
        }

        if (!contactId) {
          const customerNo = await assignCustomerNo(r.orgId);
          const [created] = await db
            .insert(contactsTable)
            .values({
              orgId: r.orgId,
              companyId,
              customerNo,
              name: displayName,
              email: email || null,
              emailNormalized: emailNorm,
              phone: phone || null,
              phoneNormalized: phoneNorm,
              title: title || null,
            })
            .returning({ id: contactsTable.id });
          contactId = created.id;
          summary.contactsCreated++;
        }

        const stage = mapStatus(leadStatus);
        if (stage) {
          const existingLead = await db
            .select({ id: leadsTable.id })
            .from(leadsTable)
            .where(and(eq(leadsTable.orgId, r.orgId), eq(leadsTable.contactId, contactId)))
            .limit(1);
          if (existingLead[0]) {
            await db
              .update(leadsTable)
              .set({
                stage,
                valueUsd: valueUsd ?? undefined,
                closeDate: closeDate ?? undefined,
                source: "import",
              })
              .where(eq(leadsTable.id, existingLead[0].id));
          } else {
            await db.insert(leadsTable).values({
              orgId: r.orgId,
              contactId,
              assignedTo: r.userId,
              stage,
              valueUsd,
              closeDate,
              source: "import",
            });
            summary.leadsCreated++;
          }
        }
      } catch (err) {
        req.log.error({ err, row: i + 2 }, "Import row failed");
        summary.skipped++;
        summary.errors.push({
          row: i + 2,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    res.json(summary);
  },
);

function sanitizeCell(s: string): string {
  // Prefix cells that start with formula-trigger chars to neutralize CSV/XLSX
  // formula injection (https://owasp.org/www-community/attacks/CSV_Injection).
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = sanitizeCell(String(v));
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = columns.join(",");
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

function toXlsx(rows: Record<string, unknown>[], columns: string[], sheetName: string): Buffer {
  const aoa: unknown[][] = [columns];
  for (const r of rows) {
    aoa.push(
      columns.map((c) => {
        const v = r[c];
        if (typeof v === "string") return sanitizeCell(v);
        return v ?? "";
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: Math.max(12, Math.min(40, c.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const CONTACT_COLUMNS = [
  "name",
  "email",
  "phone",
  "title",
  "company",
  "tags",
  "createdAt",
];

const LEAD_COLUMNS = [
  "contactName",
  "contactEmail",
  "contactPhone",
  "company",
  "stage",
  "valueUsd",
  "currency",
  "closeDate",
  "source",
  "createdAt",
  "updatedAt",
];

router.get(
  "/export/contacts",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const format = String(req.query.format ?? "csv").toLowerCase();
    const rows = await db
      .select({
        name: contactsTable.name,
        email: contactsTable.email,
        phone: contactsTable.phone,
        title: contactsTable.title,
        company: companiesTable.name,
        tags: contactsTable.tags,
        createdAt: contactsTable.createdAt,
      })
      .from(contactsTable)
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .where(eq(contactsTable.orgId, r.orgId));

    const formatted = rows.map((row) => ({
      ...row,
      tags: Array.isArray(row.tags) ? row.tags.join("; ") : "",
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "xlsx") {
      const buf = toXlsx(formatted, CONTACT_COLUMNS, "Contacts");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="salesos-contacts-${stamp}.xlsx"`);
      res.send(buf);
      return;
    }
    const csv = toCsv(formatted, CONTACT_COLUMNS);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="salesos-contacts-${stamp}.csv"`);
    res.send(csv);
  },
);

router.get(
  "/export/leads",
  requireAuth,
  async (req, res): Promise<void> => {
    const r = req as AuthenticatedRequest;
    const format = String(req.query.format ?? "csv").toLowerCase();
    const rows = await db
      .select({
        contactName: contactsTable.name,
        contactEmail: contactsTable.email,
        contactPhone: contactsTable.phone,
        company: companiesTable.name,
        stage: leadsTable.stage,
        valueUsd: leadsTable.valueUsd,
        currency: leadsTable.currency,
        closeDate: leadsTable.closeDate,
        source: leadsTable.source,
        createdAt: leadsTable.createdAt,
        updatedAt: leadsTable.updatedAt,
      })
      .from(leadsTable)
      .leftJoin(contactsTable, eq(leadsTable.contactId, contactsTable.id))
      .leftJoin(companiesTable, eq(contactsTable.companyId, companiesTable.id))
      .where(eq(leadsTable.orgId, r.orgId));

    const formatted = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt ?? ""),
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "xlsx") {
      const buf = toXlsx(formatted, LEAD_COLUMNS, "Leads");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="salesos-leads-${stamp}.xlsx"`);
      res.send(buf);
      return;
    }
    const csv = toCsv(formatted, LEAD_COLUMNS);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="salesos-leads-${stamp}.csv"`);
    res.send(csv);
  },
);

export default router;
