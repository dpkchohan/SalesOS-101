import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

const ADMIN_EMAILS = new Set(["deepak@pddt.in", "dpkchohan@gmail.com"]);

export interface AdminRequest extends Request {
  clerkUserId: string;
  adminEmail: string;
}

export async function adminAuth(
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
    const u = await clerkClient.users.getUser(clerkUserId);
    const email =
      u.primaryEmailAddress?.emailAddress ??
      u.emailAddresses[0]?.emailAddress;
    if (!email || !ADMIN_EMAILS.has(email.toLowerCase())) {
      res.status(403).json({ error: "Forbidden: admin access only" });
      return;
    }
    const r = req as AdminRequest;
    r.clerkUserId = clerkUserId;
    r.adminEmail = email;
    next();
  } catch {
    res.status(500).json({ error: "Failed to verify admin identity" });
  }
}
