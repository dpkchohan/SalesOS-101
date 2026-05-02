import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companyCredentialsTable } from "@workspace/db";
import {
  GetCompanyCredentialsResponse,
  UpsertCompanyCredentialsBody,
  UpsertCompanyCredentialsResponse,
} from "@workspace/api-zod";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";

const router: IRouter = Router();

const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;

function normalizeColor(c: string | null | undefined): string | null {
  if (!c) return null;
  const trimmed = c.trim();
  if (!HEX_RE.test(trimmed)) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function emptyForOrg(orgId: string) {
  return {
    id: null,
    orgId,
    companyName: null,
    companyLogoUrl: null,
    primaryColor: "#F94D00",
    secondaryColor: "#7C3AED",
    accentColor: "#06B6D4",
    footerText: null,
    website: null,
    phone: null,
    email: null,
    address: null,
    taxId: null,
    updatedAt: null,
  };
}

router.get("/company-credentials", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const [row] = await db
    .select()
    .from(companyCredentialsTable)
    .where(eq(companyCredentialsTable.orgId, r.orgId))
    .limit(1);
  if (!row) {
    res.json(GetCompanyCredentialsResponse.parse(emptyForOrg(r.orgId)));
    return;
  }
  res.json(
    GetCompanyCredentialsResponse.parse({
      ...row,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    }),
  );
});

router.put("/company-credentials", requireAuth, async (req, res): Promise<void> => {
  const r = req as AuthenticatedRequest;
  const body = UpsertCompanyCredentialsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const data = body.data;

  for (const colorField of ["primaryColor", "secondaryColor", "accentColor"] as const) {
    const v = data[colorField];
    if (v != null && v !== "" && !HEX_RE.test(v.trim())) {
      res.status(400).json({ error: `Invalid hex color for ${colorField}` });
      return;
    }
  }

  if (data.companyLogoUrl && data.companyLogoUrl.startsWith("data:")) {
    if (data.companyLogoUrl.length > 3_500_000) {
      res.status(413).json({ error: "Logo too large (max ~2.5MB)" });
      return;
    }
  }

  const writeable: Record<string, unknown> = {
    companyName: data.companyName ?? null,
    companyLogoUrl: data.companyLogoUrl ?? null,
    primaryColor: normalizeColor(data.primaryColor) ?? "#F94D00",
    secondaryColor: normalizeColor(data.secondaryColor) ?? "#7C3AED",
    accentColor: normalizeColor(data.accentColor) ?? "#06B6D4",
    footerText: data.footerText ?? null,
    website: data.website ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    address: data.address ?? null,
    taxId: data.taxId ?? null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: companyCredentialsTable.id })
    .from(companyCredentialsTable)
    .where(eq(companyCredentialsTable.orgId, r.orgId))
    .limit(1);

  let saved;
  if (existing) {
    const [row] = await db
      .update(companyCredentialsTable)
      .set(writeable)
      .where(eq(companyCredentialsTable.orgId, r.orgId))
      .returning();
    saved = row;
  } else {
    const [row] = await db
      .insert(companyCredentialsTable)
      .values({ ...writeable, orgId: r.orgId })
      .returning();
    saved = row;
  }

  res.json(
    UpsertCompanyCredentialsResponse.parse({
      ...saved,
      updatedAt: saved.updatedAt?.toISOString() ?? null,
    }),
  );
});

export default router;
