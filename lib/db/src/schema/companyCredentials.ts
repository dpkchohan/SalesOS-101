import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const companyCredentialsTable = pgTable(
  "company_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    companyName: text("company_name"),
    companyLogoUrl: text("company_logo_url"),
    primaryColor: text("primary_color").default("#F94D00"),
    secondaryColor: text("secondary_color").default("#7C3AED"),
    accentColor: text("accent_color").default("#06B6D4"),
    footerText: text("footer_text"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxId: text("tax_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("company_credentials_org_unique").on(t.orgId)],
);

export type CompanyCredentials = typeof companyCredentialsTable.$inferSelect;
