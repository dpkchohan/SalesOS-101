import { Router, type IRouter } from "express";
import { and, eq, ilike } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import {
  ListCompaniesQueryParams,
  ListCompaniesResponse,
  CreateCompanyBody,
  GetCompanyParams,
  GetCompanyResponse,
  UpdateCompanyParams,
  UpdateCompanyBody,
  UpdateCompanyResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

router.get("/companies", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const q = ListCompaniesQueryParams.safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: q.error.message });
    return;
  }
  const where = q.data.search
    ? and(eq(companiesTable.orgId, r.orgId), ilike(companiesTable.name, `%${q.data.search}%`))
    : eq(companiesTable.orgId, r.orgId);
  const rows = await db.select().from(companiesTable).where(where).orderBy(companiesTable.name);
  res.json(ListCompaniesResponse.parse(rows));
});

router.post("/companies", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = CreateCompanyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .insert(companiesTable)
    .values({ ...body.data, orgId: r.orgId })
    .returning();
  res.status(201).json(GetCompanyResponse.parse(row));
});

router.get("/companies/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = GetCompanyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(companiesTable)
    .where(and(eq(companiesTable.id, params.data.id), eq(companiesTable.orgId, r.orgId)));
  if (!row) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(GetCompanyResponse.parse(row));
});

router.put("/companies/:id", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const params = UpdateCompanyParams.safeParse(req.params);
  const body = UpdateCompanyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .update(companiesTable)
    .set(body.data)
    .where(and(eq(companiesTable.id, params.data.id), eq(companiesTable.orgId, r.orgId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(UpdateCompanyResponse.parse(row));
});

export default router;
