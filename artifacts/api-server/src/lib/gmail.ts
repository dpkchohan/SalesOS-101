import { getValidAccessToken } from "./googleTokens";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  fromName?: string | null;
}

function base64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stripCrlf(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

function quoteDisplayName(name: string): string {
  const safe = stripCrlf(name).replace(/["\\]/g, "");
  return `"${safe}"`;
}

function buildRawMime({ to, subject, html, fromName }: SendEmailParams): string {
  const safeTo = stripCrlf(to);
  const safeSubject = stripCrlf(subject);
  const fromHeader = fromName ? `${quoteDisplayName(fromName)} <me>` : "me";
  const lines = [
    `From: ${fromHeader}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ];
  return lines.join("\r\n");
}

export async function sendProposalEmail(
  userId: string,
  params: SendEmailParams,
): Promise<{ id: string | null }> {
  const token = await getValidAccessToken(userId);
  const raw = base64Url(buildRawMime(params));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail send failed (${response.status}): ${text.slice(0, 500)}`);
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: data.id ?? null };
}
