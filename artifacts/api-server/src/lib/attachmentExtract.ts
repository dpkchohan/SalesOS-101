import * as XLSX from "xlsx";
import mammoth from "mammoth";
import JSZip from "jszip";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - direct import skips pdf-parse's debug entrypoint that reads a test file at startup
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { claudeJson, claudeJsonWithImage } from "./claude";
import {
  parseSmartFile,
  extractBatch,
  normalizeContact,
  type SmartContact,
} from "./smartImport";

export type AttachmentKind = "image" | "pdf" | "docx" | "pptx" | "xlsx" | "txt";

export interface ExtractedContact {
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: string | null;
  notes: string | null;
}

export interface ExtractedLead {
  contactName: string;
  stage: string | null;
  valueUsd: number | null;
  closeDate: string | null;
  source: string | null;
}

export interface ExtractedData {
  kind: "card" | "document" | "spreadsheet";
  confidence: number;
  summary: string | null;
  contacts: ExtractedContact[];
  leads: ExtractedLead[];
  rawTextPreview?: string | null;
}

const ALLOWED_MIME: Record<string, AttachmentKind> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xlsx",
  "text/csv": "xlsx",
  "text/plain": "txt",
};

const EXT_FALLBACK: Record<string, AttachmentKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  xls: "xlsx",
  csv: "xlsx",
  txt: "txt",
};

export function classifyAttachment(
  mimeType: string,
  fileName: string,
): AttachmentKind | null {
  const k = ALLOWED_MIME[mimeType.toLowerCase()];
  if (k) return k;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXT_FALLBACK[ext] ?? null;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const CARD_SYSTEM = `You read business card images. Extract the contact's details.
Reply with strict JSON only (no prose):
{
  "name": "<full name>",
  "email": "<email or null>",
  "phone": "<phone or null>",
  "title": "<job title or null>",
  "company": "<company or null>",
  "notes": "<extra info found on the card or null>",
  "confidence": <0-1 number, your confidence the data is correct>
}
If you cannot find a person on the card, set name to "" and confidence to 0.`;

const DOC_SYSTEM = `You read sales documents (PDFs, slide decks, Word docs, plain text) and pull out:
1. A short summary (1-2 sentences) of what the document is.
2. Every distinct sales contact mentioned (people with name + at least an email or phone or company).
3. Any deal/lead-like info attached to those contacts (deal stage, value, close date).
Reply with strict JSON only:
{
  "summary": "<1-2 sentences>",
  "contacts": [
    { "name": "...", "email": "..."|null, "phone": "..."|null, "title": "..."|null, "company": "..."|null, "notes": "..."|null }
  ],
  "leads": [
    { "contactName": "<matches one of the contacts above>",
      "stage": "new"|"interested"|"qualified"|"negotiating"|"won"|"lost"|null,
      "valueUsd": <integer or null>,
      "closeDate": "YYYY-MM-DD"|null,
      "source": "<short string or null>" }
  ],
  "confidence": <0-1>
}
Return an empty contacts array if you cannot find any.`;

interface CardJson {
  name?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  notes?: string | null;
  confidence?: number;
}

interface DocJson {
  summary?: string;
  contacts?: ExtractedContact[];
  leads?: ExtractedLead[];
  confidence?: number;
}

function clampConfidence(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return Math.min(1, v / 100);
  return v;
}

function smartContactToExtracted(c: SmartContact): ExtractedContact {
  return {
    name: c.name,
    email: c.email,
    phone: c.phone,
    title: c.title,
    company: c.company,
    notes: c.notes,
  };
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text ?? "";
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

async function extractTextFromPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort();
  const parts: string[] = [];
  for (const name of slideFiles) {
    const xml = await zip.files[name].async("string");
    const text = xml
      .replace(/<a:br[^>]*\/>/g, "\n")
      .replace(/<\/a:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[…truncated]";
}

async function extractFromImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedData> {
  const base64 = buffer.toString("base64");
  const result = await claudeJsonWithImage<CardJson>(
    CARD_SYSTEM,
    "Extract the contact details from this business card.",
    { mediaType: mimeType, base64 },
    { maxTokens: 800 },
  );
  const name = (result.name ?? "").trim();
  const contact: ExtractedContact = {
    name,
    email: result.email?.toString().trim().toLowerCase() || null,
    phone: result.phone?.toString().trim() || null,
    title: result.title?.toString().trim() || null,
    company: result.company?.toString().trim() || null,
    notes: result.notes?.toString().trim() || null,
  };
  const confidence = clampConfidence(result.confidence);
  const hasContact = !!(contact.name || contact.email || contact.phone);
  return {
    kind: "card",
    confidence: hasContact ? confidence : 0,
    summary: hasContact ? `Business card for ${contact.name || contact.email}` : null,
    contacts: hasContact ? [contact] : [],
    leads: [],
  };
}

async function extractFromDocumentText(
  text: string,
  source: string,
): Promise<ExtractedData> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      kind: "document",
      confidence: 0,
      summary: null,
      contacts: [],
      leads: [],
      rawTextPreview: null,
    };
  }
  const result = await claudeJson<DocJson>(
    DOC_SYSTEM,
    `Source: ${source}\n\nDocument text:\n${truncate(trimmed, 30000)}`,
    { maxTokens: 2500 },
  );
  const contacts = Array.isArray(result.contacts)
    ? result.contacts
        .map((c) => ({
          name: String(c.name ?? "").trim(),
          email: c.email ? String(c.email).trim().toLowerCase() : null,
          phone: c.phone ? String(c.phone).trim() : null,
          title: c.title ? String(c.title).trim() : null,
          company: c.company ? String(c.company).trim() : null,
          notes: c.notes ? String(c.notes).trim() : null,
        }))
        .filter((c) => c.name || c.email)
    : [];
  const leads = Array.isArray(result.leads)
    ? result.leads
        .map((l) => ({
          contactName: String(l.contactName ?? "").trim(),
          stage: l.stage ? String(l.stage).trim().toLowerCase() : null,
          valueUsd:
            l.valueUsd != null && Number.isFinite(Number(l.valueUsd))
              ? Math.round(Number(l.valueUsd))
              : null,
          closeDate: l.closeDate ? String(l.closeDate).trim() : null,
          source: l.source ? String(l.source).trim() : null,
        }))
        .filter((l) => l.contactName)
    : [];
  return {
    kind: "document",
    confidence: contacts.length === 0 ? 0 : clampConfidence(result.confidence),
    summary: result.summary ? String(result.summary).trim() : null,
    contacts,
    leads,
    rawTextPreview: truncate(trimmed, 600),
  };
}

async function extractFromSpreadsheet(
  buffer: Buffer,
  filename: string,
): Promise<ExtractedData> {
  const parsed = parseSmartFile(buffer, filename);
  if (parsed.rows.length === 0) {
    return {
      kind: "spreadsheet",
      confidence: 0,
      summary: null,
      contacts: [],
      leads: [],
    };
  }
  const sample = parsed.rows.slice(0, 50);
  const { contacts: smartContacts } = await extractBatch(sample, parsed.headers);
  const normalized = smartContacts.map(normalizeContact).filter((c) => c.name || c.email);
  const contacts = normalized.map(smartContactToExtracted);
  const leads: ExtractedLead[] = normalized
    .filter((c) => c.stage)
    .map((c) => ({
      contactName: c.name || c.email || "",
      stage: c.stage,
      valueUsd: c.valueUsd,
      closeDate: c.closeDate,
      source: "chat-attachment",
    }));
  const confidence = contacts.length === 0 ? 0 : 0.85;
  const summary =
    contacts.length === 0
      ? `${parsed.rows.length} rows in ${filename}, but no contacts could be parsed.`
      : `${contacts.length} contact${contacts.length === 1 ? "" : "s"} found in ${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}${parsed.rows.length > sample.length ? ` (first ${sample.length} processed)` : ""}.`;
  return {
    kind: "spreadsheet",
    confidence,
    summary,
    contacts,
    leads,
  };
}

export async function extractAttachment(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractedData> {
  const kind = classifyAttachment(mimeType, fileName);
  if (!kind) throw new Error(`Unsupported file type: ${mimeType || fileName}`);

  switch (kind) {
    case "image":
      return extractFromImage(buffer, mimeType.toLowerCase().startsWith("image/") ? mimeType : "image/png");
    case "pdf": {
      const text = await extractTextFromPdf(buffer);
      return extractFromDocumentText(text, fileName);
    }
    case "docx": {
      const text = await extractTextFromDocx(buffer);
      return extractFromDocumentText(text, fileName);
    }
    case "pptx": {
      const text = await extractTextFromPptx(buffer);
      return extractFromDocumentText(text, fileName);
    }
    case "txt": {
      const text = buffer.toString("utf8");
      return extractFromDocumentText(text, fileName);
    }
    case "xlsx":
      return extractFromSpreadsheet(buffer, fileName);
  }
}
