import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, googleConnectionsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  getOAuth2Client,
  GOOGLE_SCOPES,
  GMAIL_READ_SCOPE,
  encodeOAuthState,
  decodeOAuthState,
  hasGmailReadScope,
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
      const ac = new AbortController();
      const emailTimeout = setTimeout(() => ac.abort(), 2000);
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: ac.signal,
      });
      clearTimeout(emailTimeout);
      if (infoRes.ok) {
        const info = (await infoRes.json()) as { email?: string };
        googleEmail = info.email ?? "";
      }
    } catch {
      // non-fatal
    }

    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    const scopesStr = GOOGLE_SCOPES.join(" ");

    await db
      .insert(googleConnectionsTable)
      .values({
        userId: identity.userId,
        orgId: identity.orgId,
        googleEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry: expiry,
        scopes: scopesStr,
      })
      .onConflictDoUpdate({
        target: googleConnectionsTable.userId,
        set: {
          googleEmail,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          tokenExpiry: expiry,
          scopes: scopesStr,
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
        emailSyncEnabled: googleConnectionsTable.emailSyncEnabled,
        lastSyncedAt: googleConnectionsTable.lastSyncedAt,
        updatedAt: googleConnectionsTable.updatedAt,
      })
      .from(googleConnectionsTable)
      .where(eq(googleConnectionsTable.userId, r.userId))
      .limit(1);

    if (!conn) {
      res.json({ connected: false, email: null, emailSyncEnabled: false });
      return;
    }

    res.json({
      connected: true,
      email: conn.googleEmail,
      emailSyncEnabled: conn.emailSyncEnabled,
      hasEmailReadScope: hasGmailReadScope(conn),
      lastSyncedAt: conn.lastSyncedAt,
      updatedAt: conn.updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Google connection status");
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.patch("/auth/google/email-sync", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }

  try {
    const [conn] = await db
      .select({ id: googleConnectionsTable.id, scopes: googleConnectionsTable.scopes })
      .from(googleConnectionsTable)
      .where(eq(googleConnectionsTable.userId, r.userId))
      .limit(1);

    if (!conn) {
      res.status(404).json({ error: "No Google account connected" });
      return;
    }

    if (enabled && !hasGmailReadScope(conn)) {
      res.status(403).json({
        error: "Gmail read permission not granted",
        needsReconnect: true,
        reconnectUrl: "/api/auth/google/connect",
      });
      return;
    }

    await db
      .update(googleConnectionsTable)
      .set({ emailSyncEnabled: enabled, updatedAt: new Date() })
      .where(eq(googleConnectionsTable.userId, r.userId));

    res.json({ emailSyncEnabled: enabled });
  } catch (err) {
    req.log.error({ err }, "Failed to update email sync setting");
    res.status(500).json({ error: "Failed to update email sync" });
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
        // best-effort revoke
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
