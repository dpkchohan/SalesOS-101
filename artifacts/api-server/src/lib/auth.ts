import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, organizationsTable } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { seedDemoData } from "./seedDemo";

export interface AuthenticatedRequest extends Request {
  userId: string;
  orgId: string;
  clerkUserId: string;
  userName: string;
  userEmail: string;
  orgName: string;
}

async function fetchClerkProfile(clerkUserId: string): Promise<{
  email: string;
  name: string;
}> {
  try {
    const u = await clerkClient.users.getUser(clerkUserId);
    const email =
      u.primaryEmailAddress?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      `${clerkUserId}@clerk.local`;
    const name =
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.username ||
      email.split("@")[0] ||
      "Sales Rep";
    return { email, name };
  } catch {
    return { email: `${clerkUserId}@clerk.local`, name: "Sales Rep" };
  }
}

async function getOrCreateUser(clerkUserId: string) {
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId));
  if (existing[0]) {
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, existing[0].orgId));
    return { user: existing[0], org };
  }

  const profile = await fetchClerkProfile(clerkUserId);
  const orgName = profile.name ? `${profile.name.split(" ")[0]}'s Workspace` : "My Workspace";

  const [org] = await db
    .insert(organizationsTable)
    .values({ name: orgName })
    .returning();

  const [user] = await db
    .insert(usersTable)
    .values({
      clerkUserId,
      orgId: org.id,
      email: profile.email,
      name: profile.name,
      role: "owner",
    })
    .returning();

  // Seed demo data for first-time users so the app is alive on first paint.
  try {
    await seedDemoData(org.id, user.id);
  } catch (err) {
    console.error("Demo seed failed:", err);
  }

  return { user, org };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { user, org } = await getOrCreateUser(clerkUserId);
    const r = req as AuthenticatedRequest;
    r.clerkUserId = clerkUserId;
    r.userId = user.id;
    r.orgId = user.orgId;
    r.userName = user.name;
    r.userEmail = user.email;
    r.orgName = org?.name ?? "Workspace";
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to resolve user");
    res.status(500).json({ error: "Failed to resolve user" });
  }
}
