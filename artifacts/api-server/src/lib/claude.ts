import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.CLAUDE_API_KEY;

let client: Anthropic | null = null;
export function getClaude(): Anthropic {
  if (!apiKey) throw new Error("CLAUDE_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

export const CLAUDE_MODEL = "claude-haiku-4-5";

function parseJsonFromText<T>(text: string): T {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = match ? match[1] : text;
  const start = jsonText.search(/[\[{]/);
  const slice = start >= 0 ? jsonText.slice(start) : jsonText;

  // 1. Direct parse
  try {
    return JSON.parse(slice) as T;
  } catch (firstErr) {
    const msg = firstErr instanceof SyntaxError ? firstErr.message : String(firstErr);
    console.warn(`[claudeJson] parse failed: ${msg} | length=${slice.length}`);
    console.warn(`[claudeJson] tail (200 chars): ${slice.slice(-200)}`);
  }

  // 2. Scan backward: try each closing brace/bracket as a truncation point
  for (let i = slice.length - 1; i > 0; i--) {
    const ch = slice[i];
    if (ch !== "}" && ch !== "]") continue;
    try {
      return JSON.parse(slice.slice(0, i + 1)) as T;
    } catch {
      continue;
    }
  }

  // 3. Specialist: extract partial "contacts" array from extractBatch responses
  const arrMatch = slice.match(/"contacts"\s*:\s*\[/);
  if (arrMatch && arrMatch.index !== undefined) {
    const arrStart = slice.indexOf("[", arrMatch.index);
    const items: string[] = [];
    let depth = 0;
    let inStr = false;
    let esc = false;
    let objStart = -1;
    for (let i = arrStart + 1; i < slice.length; i++) {
      const c = slice[i];
      if (esc) { esc = false; continue; }
      if (c === "\\" && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") { if (depth === 0) objStart = i; depth++; }
      else if (c === "}") {
        depth--;
        if (depth === 0 && objStart >= 0) {
          const candidate = slice.slice(objStart, i + 1);
          try { JSON.parse(candidate); items.push(candidate); } catch { break; }
          objStart = -1;
        }
      } else if (c === "]" && depth === 0) break;
    }
    if (items.length > 0) {
      try {
        return JSON.parse(`{"contacts":[${items.join(",")}],"warnings":[]}`) as T;
      } catch { /* fall through */ }
    }
  }

  throw new Error(`Failed to parse Claude JSON response (length=${slice.length})`);
}

export async function claudeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<T> {
  const c = getClaude();
  const resp = await c.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonFromText<T>(text);
}

export async function claudeJsonWithImage<T>(
  systemPrompt: string,
  userPrompt: string,
  image: { mediaType: string; base64: string },
  opts: { maxTokens?: number } = {},
): Promise<T> {
  const c = getClaude();
  const resp = await c.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: image.base64,
            },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJsonFromText<T>(text);
}
