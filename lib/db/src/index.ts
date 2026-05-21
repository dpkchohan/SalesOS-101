import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Enable SSL for any external database (Supabase, Neon, Railway Postgres, etc.).
// Local postgres (localhost / 127.0.0.1) does not need SSL.
const isLocalDb = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(
  process.env.DATABASE_URL,
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isLocalDb ? {} : { ssl: { rejectUnauthorized: false } }),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
