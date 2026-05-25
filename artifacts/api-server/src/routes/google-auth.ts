import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, googleConnectionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  getOAuth2Client,
  GOOGLE_SCOPES,
  encodeOAuthState,
  decodeOAuthState,
} from "../lib/googleTokens";

const router: IRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://salesos.pddt.in";

router.get("/auth/google/connect", requireAuth, (req, res): void => {
  const r = req as AuthenticatedRequest;
  const client = getOAuth2Client();
  const state = encodeOAuthState(r.userId, r.orgId);
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
  res.redirect(url);
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    req.log.warn({ error }, "Google OAuth denied by user");
    res.redirect(`${FRONTEND_URL}/settings?google=denied`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${FRONTEND_URL}/settings?google=error&reason=missing_params`);
    return;
  }

  const identity = decodeOAuthState(state);
  if (!identity) {
    req.log.warn({ state }, "Google OAuth invalid state");
    res.redirect(`${FRONTEND_URL}/settings?google=error&reason=invalid_state`);
    return;
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Token exchange returned no access_token");
    }

    let googleEmail = "";
    try {
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const info = (await infoRes.json()) as { email?: string };
        googleEmail = info.email ?? "";
      }
    } catch {
      // non-fatal — email is nice-to-have
    }

    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await db
      .insert(googleConnectionsTable)
      .values({
        userId: identity.userId,
        orgId: identity.orgId,
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: expiry,
        scopes: GOOGLE_SCOPES.join(" "),
      })
      .onConflictDoUpdate({
        target: googleConnectionsTable.userId,
        set: {
          googleEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiry: expiry,
          scopes: GOOGLE_SCOPES.join(" "),
          updatedAt: new Date(),
        },
      });

    res.redirect(`${FRONTEND_URL}/settings?google=connected`);
  } catch (err) {
    req.log.error({ err }, "Google OAuth callback failed");
    const reason = err instanceof Error ? encodeURIComponent(err.message) : "token_exchange";
    res.redirect(`${FRONTEND_URL}/settings?google=error&reason=${reason}`);
  }
});

router.get("/auth/google/status", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const [conn] = await db
      .select({
        googleEmail: googleConnectionsTable.googleEmail,
        scopes: googleConnectionsTable.scopes,
        updatedAt: googleConnectionsTable.updatedAt,
      })
      .from(googleConnectionsTable)
      .where(eq(googleConnectionsTable.userId, r.userId))
      .limit(1);

    if (!conn) {
      res.json({ connected: false, email: null });
      return;
    }

    res.json({ connected: true, email: conn.googleEmail, updatedAt: conn.updatedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Google connection status");
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.delete("/auth/google/disconnect", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  try {
    const [conn] = await db
      .select({ accessToken: googleConnectionsTable.accessToken })
      .from(googleConnectionsTable)
      .where(eq(googleConnectionsTable.userId, r.userId))
      .limit(1);

    if (conn?.accessToken) {
      try {
        const client = getOAuth2Client();
        await client.revokeToken(conn.accessToken);
      } catch {
        // best-effort revoke — still delete the local record
      }
    }

    await db
      .delete(googleConnectionsTable)
      .where(eq(googleConnectionsTable.userId, r.userId));

    res.json({ disconnected: true });
  } catch (err) {
    req.log.error({ err }, "Failed to disconnect Google account");
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

export default router;
