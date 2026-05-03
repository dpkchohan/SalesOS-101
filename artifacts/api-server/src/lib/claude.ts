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
  try {
    return JSON.parse(slice) as T;
  } catch {
    const lastBrace = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (lastBrace > 0) {
      return JSON.parse(slice.slice(0, lastBrace + 1)) as T;
    }
    throw new Error("Failed to parse Claude JSON response");
  }
}

export async function claudeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {},
): Promise<T> {
  const c = getClaude();
  const resp = await c.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1500,
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
    max_tokens: opts.maxTokens ?? 1500,
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
