import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db, googleConnectionsTable } from "@workspace/db";
import crypto from "node:crypto";

export function getOAuth2Client(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export class NoGoogleConnectionError extends Error {
  constructor(userId: string) {
    super(`No Google connection found for user ${userId}`);
    this.name = "NoGoogleConnectionError";
  }
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const [conn] = await db
    .select()
    .from(googleConnectionsTable)
    .where(eq(googleConnectionsTable.userId, userId))
    .limit(1);

  if (!conn) throw new NoGoogleConnectionError(userId);

  const now = Date.now();
  const expiresAt = conn.tokenExpiry?.getTime() ?? 0;
  const needsRefresh = expiresAt - now < 60_000;

  if (needsRefresh) {
    if (!conn.refreshToken) {
      throw new Error(`Google access token expired and no refresh token available for user ${userId}`);
    }
    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: conn.refreshToken });
    const { credentials } = await client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error("Google token refresh returned no access_token");
    }

    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null;

    await db
      .update(googleConnectionsTable)
      .set({
        accessToken: credentials.access_token,
        tokenExpiry: newExpiry,
        updatedAt: new Date(),
      })
      .where(eq(googleConnectionsTable.userId, userId));

    return credentials.access_token;
  }

  return conn.accessToken;
}

export function hasGmailReadScope(conn: { scopes: string | null }): boolean {
  if (!conn.scopes) return false;
  return conn.scopes.includes(GMAIL_READ_SCOPE);
}

const STATE_SEPARATOR = ".";

export function encodeOAuthState(userId: string, orgId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, orgId, ts: Date.now() })).toString(
    "base64url",
  );
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "fallback-secret";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
  return `${payload}${STATE_SEPARATOR}${sig}`;
}

export function decodeOAuthState(state: string): { userId: string; orgId: string } | null {
  const sep = state.lastIndexOf(STATE_SEPARATOR);
  if (sep === -1) return null;
  const payload = state.slice(0, sep);
  const sig = state.slice(sep + 1);
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "fallback-secret";
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 24);
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof parsed.userId !== "string" || typeof parsed.orgId !== "string") return null;
    return { userId: parsed.userId, orgId: parsed.orgId };
  } catch {
    return null;
  }
}
