import type Anthropic from "@anthropic-ai/sdk";
import { getClaude, CLAUDE_MODEL } from "./claude";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedContact {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  tags?: string[];
  notes?: string;
  conversationHistory?: string;
  dealHistory?: string;
  lastContactDate?: string;
  source?: string;
}

export interface ExtractedOrganization {
  name: string;
  industry?: string;
  website?: string;
  address?: string;
}

export interface ExtractionResult {
  contacts: ExtractedContact[];
  organizations: ExtractedOrganization[];
}

export interface ExtractionError {
  error: string;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a contact extraction assistant. Extract every person and organization " +
  "from the file. For organizations only include companies that employ one of the extracted contacts.";

const JSON_SCHEMA = `
Return ONLY valid JSON — no markdown fences, no explanation — matching this exact structure:
{
  "contacts": [
    {
      "name": "string (required)",
      "email": "Primary email address only. If multiple emails exist, use the first/primary one.",
      "phone": "Single normalized phone number (e.g., +919876543210). If multiple numbers exist, use the primary/first one. Do NOT concatenate multiple numbers.",
      "title": "string",
      "company": "string",
      "tags": ["string"],
      "notes": "string",
      "conversationHistory": "string",
      "dealHistory": "string",
      "lastContactDate": "YYYY-MM-DD",
      "source": "string"
    }
  ],
  "organizations": [
    {
      "name": "string (required)",
      "industry": "string",
      "website": "string",
      "address": "string"
    }
  ]
}
Rules:
- "name" is the only required field per contact.
- "email" must be a single email address string, never an array or multiple addresses.
- "phone" must be a single phone number string, never an array or concatenated list.
- Omit keys that have no value — do not include null.
- Dates must be ISO 8601 (YYYY-MM-DD).
- Return empty arrays if nothing is found.`;

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fenced ? fenced[1] : text;
  const start = src.search(/[\[{]/);
  const slice = start >= 0 ? src.slice(start) : src;
  try {
    return JSON.parse(slice) as T;
  } catch {
    const last = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (last > 0) return JSON.parse(slice.slice(0, last + 1)) as T;
    throw new Error("Could not parse JSON from Claude response");
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches a file from `downloadUrl`, sends it to Claude, and returns
 * structured contact + organisation data.
 *
 * Returns `{ error: string }` instead of throwing so callers can distinguish
 * extraction failures from programming errors.
 */
export async function extractContactsFromFile(
  downloadUrl: string,
  filename: string,
  contentType: string,
): Promise<ExtractionResult | ExtractionError> {
  // ── 1. Fetch the file from S3 ─────────────────────────────────────────────
  let buf: Buffer;
  try {
    const res = await fetch(downloadUrl);
    if (!res.ok) return { error: `Failed to fetch file: HTTP ${res.status} ${res.statusText}` };
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return { error: `Failed to fetch file: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── 2. Build Claude message content based on file type ────────────────────
  const isText =
    contentType.startsWith("text/") ||
    /application\/(json|csv|xml)/.test(contentType) ||
    /\.(csv|txt|json|tsv|xml)$/i.test(filename);

  const isPdf = contentType.includes("pdf") || /\.pdf$/i.test(filename);

  const isImage =
    contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename);

  let msgContent: Anthropic.MessageParam["content"];

  if (isText) {
    msgContent = `File: ${filename}\n\n${buf.toString("utf-8")}${JSON_SCHEMA}`;
  } else if (isPdf) {
    msgContent = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buf.toString("base64"),
        },
      } as Anthropic.RequestDocumentBlock,
      { type: "text", text: `File: ${filename}${JSON_SCHEMA}` },
    ];
  } else if (isImage) {
    const mediaType = (
      contentType.startsWith("image/") ? contentType : "image/png"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    msgContent = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
      },
      { type: "text", text: `File: ${filename}${JSON_SCHEMA}` },
    ];
  } else {
    // Excel / other binary — attempt as base64 document.
    // Claude can parse Office Open XML when sent as a PDF-typed document.
    msgContent = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buf.toString("base64"),
        },
      } as Anthropic.RequestDocumentBlock,
      { type: "text", text: `File: ${filename} (${contentType})${JSON_SCHEMA}` },
    ];
  }

  // ── 3. Call Claude ────────────────────────────────────────────────────────
  try {
    const claude = getClaude();
    const resp = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: msgContent }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseJson<ExtractionResult>(text);

    if (!Array.isArray(parsed.contacts) || !Array.isArray(parsed.organizations)) {
      return { error: "Claude returned an unexpected response structure" };
    }

    return parsed;
  } catch (err) {
    return {
      error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
