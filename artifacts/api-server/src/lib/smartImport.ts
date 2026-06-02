import * as XLSX from "xlsx";
import { claudeJson } from "./claude";

export interface ParsedRow {
  [key: string]: string;
}

export interface ParsedFile {
  headers: string[];
  rows: ParsedRow[];
}

export function parseSmartFile(buffer: Buffer, filename: string): ParsedFile {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") {
    const text = buffer.toString("utf8").trim();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON file");
    }
    let arr: unknown[] = [];
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const found = Object.values(obj).find((v) => Array.isArray(v));
      if (Array.isArray(found)) arr = found;
      else arr = [obj];
    }
    const headerSet = new Set<string>();
    const rows: ParsedRow[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const flat: ParsedRow = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        const s =
          v == null
            ? ""
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
        flat[k] = s.trim();
        headerSet.add(k);
      }
      rows.push(flat);
    }
    return { headers: Array.from(headerSet), rows };
  }
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
  const headers = (aoa[0] ?? [])
    .map((h) => String(h ?? "").trim())
    .filter((h) => h !== "");
  const rows: ParsedRow[] = [];
  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const obj: ParsedRow = {};
    let any = false;
    for (let j = 0; j < headers.length; j++) {
      const v = row[j];
      const s = v == null ? "" : String(v).trim();
      if (s) any = true;
      obj[headers[j]] = s;
    }
    if (any) rows.push(obj);
  }
  return { headers, rows };
}

export interface SmartContact {
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  stage: string | null;
  valueUsd: number | null;
  closeDate: string | null;
  notes: string | null;
}

export interface PreviewAnalysis {
  detectedType: string;
  estimatedContacts: number;
  estimatedLeads: number;
  qualityScore: number;
  issues: string[];
  sampleContacts: SmartContact[];
  columnMapping: Record<string, string>;
}

const VALID_STAGES = new Set([
  "new",
  "interested",
  "qualified",
  "negotiating",
  "won",
  "lost",
]);

export function normalizeEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
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

export function normalizeStage(s: string | null | undefined): string | null {
  if (!s) return null;
  const k = String(s).trim().toLowerCase();
  if (VALID_STAGES.has(k)) return k;
  const map: Record<string, string> = {
    open: "interested",
    "open deal": "qualified",
    connected: "qualified",
    "attempted to contact": "interested",
    "in progress": "negotiating",
    proposal: "negotiating",
    "closed won": "won",
    "closed lost": "lost",
    "bad timing": "lost",
    unqualified: "lost",
  };
  return map[k] ?? null;
}

export function normalizeContact(c: SmartContact): SmartContact {
  return {
    name: String(c.name ?? "").trim(),
    email: normalizeEmail(c.email),
    phone: normalizePhone(c.phone),
    title: c.title ? String(c.title).trim() || null : null,
    company: c.company ? String(c.company).trim() || null : null,
    stage: normalizeStage(c.stage),
    valueUsd:
      c.valueUsd != null && Number.isFinite(Number(c.valueUsd))
        ? Math.round(Number(c.valueUsd))
        : null,
    closeDate: c.closeDate ? parseISODate(String(c.closeDate)) : null,
    notes: c.notes ? String(c.notes).trim() || null : null,
  };
}

function parseISODate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const SYSTEM_PROMPT = `You are a CRM data import assistant. The user uploads messy data exports (HubSpot, Salesforce, Pipedrive, mixed Excel sheets, JSON dumps). Your job is to extract a clean list of sales contacts, each optionally with a lead (deal stage / value / close date).

For each row, output one contact with these fields:
- name: full name (combine First+Last if separate). Required.
- email: lowercase, trimmed. Null if missing or clearly invalid.
- phone: digits with optional leading +. Null if missing.
- title: job title. Null if missing.
- company: company / organization / account name. Null if missing.
- stage: one of "new","interested","qualified","negotiating","won","lost". Null if not a deal.
- valueUsd: integer USD value of the deal. Null if not a deal.
- closeDate: YYYY-MM-DD. Null if missing.
- notes: short summary of any extra info on the row. Null if none.

Reply in JSON only.`;

export async function analyzePreview(
  filename: string,
  parsed: ParsedFile,
): Promise<PreviewAnalysis> {
  const sample = parsed.rows.slice(0, 50);
  const userPrompt = `File: ${filename}
Total rows: ${parsed.rows.length}
Headers: ${JSON.stringify(parsed.headers)}

Sample rows (up to 50):
${JSON.stringify(sample, null, 2)}

Analyze and return JSON of shape:
{
  "detectedType": "<short label e.g. 'HubSpot contacts export'>",
  "estimatedContacts": <integer, expected total contacts after dedupe>,
  "estimatedLeads": <integer, rows that look like deals with stage/value>,
  "qualityScore": <0-100 integer based on completeness>,
  "issues": ["<short issue strings>", ...],
  "columnMapping": { "<source_header>": "<target_field>" },
  "sampleContacts": [<up to 5 normalized contacts as described>]
}`;
  try {
    const result = await claudeJson<PreviewAnalysis>(SYSTEM_PROMPT, userPrompt, { maxTokens: 4096 });
    return {
      detectedType: result.detectedType ?? "Unknown",
      estimatedContacts: Number(result.estimatedContacts) || parsed.rows.length,
      estimatedLeads: Number(result.estimatedLeads) || 0,
      qualityScore: Math.max(0, Math.min(100, Number(result.qualityScore) || 70)),
      issues: Array.isArray(result.issues) ? result.issues.slice(0, 20) : [],
      sampleContacts: Array.isArray(result.sampleContacts)
        ? result.sampleContacts.slice(0, 5).map(normalizeContact)
        : [],
      columnMapping:
        result.columnMapping && typeof result.columnMapping === "object"
          ? result.columnMapping
          : {},
    };
  } catch (err) {
    return {
      detectedType: "Spreadsheet",
      estimatedContacts: parsed.rows.length,
      estimatedLeads: 0,
      qualityScore: 60,
      issues: [
        `AI analysis unavailable: ${err instanceof Error ? err.message : "unknown"}. Using fallback parsing.`,
      ],
      sampleContacts: [],
      columnMapping: {},
    };
  }
}

export async function extractBatch(
  rows: ParsedRow[],
  headers: string[],
): Promise<{ contacts: SmartContact[]; warnings: string[] }> {
  if (rows.length === 0) return { contacts: [], warnings: [] };
  const userPrompt = `Headers: ${JSON.stringify(headers)}
Rows (${rows.length}):
${JSON.stringify(rows, null, 2)}

Extract one contact object per row in the same order. Return JSON:
{
  "contacts": [<contact objects as described>],
  "warnings": ["<short warnings about data quality>"]
}`;
  try {
    const result = await claudeJson<{
      contacts: SmartContact[];
      warnings?: string[];
    }>(SYSTEM_PROMPT, userPrompt, { maxTokens: 8192 });
    const contacts = Array.isArray(result.contacts)
      ? result.contacts.map(normalizeContact)
      : [];
    return {
      contacts,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    };
  } catch (err) {
    // Fallback: heuristic extraction so import can still proceed even when
    // Claude is unavailable or returns malformed JSON.
    const contacts: SmartContact[] = [];
    for (const row of rows) {
      const lc: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) lc[k.toLowerCase().trim()] = v;

      // Two-pass lookup: exact match first, then substring/partial match.
      // This handles non-standard headers like "Mobile No", "Designation",
      // "Organisation", "Contact Person", "Email ID", etc.
      const get = (...keys: string[]): string => {
        for (const k of keys) {
          const v = lc[k];
          if (v && v.trim()) return v.trim();
        }
        for (const k of keys) {
          for (const [hdr, v] of Object.entries(lc)) {
            if (!v || !v.trim()) continue;
            if (hdr.includes(k) || k.includes(hdr)) return v.trim();
          }
        }
        return "";
      };

      const first = get(
        "first name", "firstname", "first", "given name", "fname",
      );
      const last = get(
        "last name", "lastname", "last", "surname", "family name", "lname",
      );
      // NOTE: "contact person" must come before "name" so the fuzzy pass
      // matches "EU Contact Person" before "Customer Name" (company column).
      const name =
        get(
          "full name", "contact person", "contact name", "person name",
          "person", "lead name", "name",
          "client name",
        ) || [first, last].filter(Boolean).join(" ").trim();

      const email = get(
        "email", "email address", "primary email", "e-mail",
        "email id", "email-id", "emailid", "mail", "mail id",
        "e mail", "work email", "business email",
      );

      // "contact number" must come before "contact" to avoid matching
      // the person-name "contact person" column for phone.
      const phone = get(
        "phone", "phone number", "mobile", "primary phone",
        "mobile no", "mobile number", "mob", "mob no", "mob number",
        "cell", "cell phone", "contact number", "contact no",
        "whatsapp", "whatsapp no", "tel", "telephone", "landline",
      );

      const title = get(
        "title", "job title", "position", "designation",
        "dept", "department", "role", "post", "job role",
        "occupation", "function",
      );

      // "customer name" / "customer" intentionally placed here so fuzzy
      // picks up a company column like "Customer Name" rather than mapping
      // it to the person-name field above.
      const company = get(
        "company", "company name", "organization", "organisation",
        "account", "account name", "firm", "org", "employer",
        "business", "business name", "workplace",
        "customer name", "customer", "client name", "client",
      );

      const stage = get(
        "stage", "lead status", "status", "deal stage",
        "pipeline stage", "opportunity stage", "sales stage",
      );

      const rawValue = get(
        "value", "amount", "deal amount", "deal value", "arr",
        "revenue", "contract value", "opportunity value",
      ).replace(/[^\d.\-]/g, "");

      const closeDate = get(
        "close date", "expected close", "expected close date",
        "closing date", "close by", "target date", "due date",
      );

      contacts.push(
        normalizeContact({
          name,
          email,
          phone,
          title,
          company,
          stage,
          valueUsd: rawValue ? (Number(rawValue) as unknown as number) : null,
          closeDate,
          notes: null,
        }),
      );
    }
    return {
      contacts,
      warnings: [
        `AI extraction unavailable: ${err instanceof Error ? err.message : "unknown"}. Used fallback header matching.`,
      ],
    };
  }
}
