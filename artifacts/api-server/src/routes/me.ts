import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  res.json(
    GetMeResponse.parse({
      id: r.userId,
      email: r.userEmail,
      name: r.userName,
      role: "rep",
      orgId: r.orgId,
      orgName: r.orgName,
    }),
  );
});

export default router;
