import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/lib/db/schema";

const localDatabaseUrl =
  "postgres://sistem_ujian:sistem_ujian@localhost:55432/sistem_ujian";
const databaseUrl = process.env.DATABASE_URL ?? localDatabaseUrl;

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL wajib diisi di production. Gunakan connection string Neon pada Environment Variables Vercel."
  );
}

const poolMax = Number(process.env.DB_POOL_MAX ?? 5);
if (!Number.isInteger(poolMax) || poolMax < 1) {
  throw new Error("DB_POOL_MAX harus berupa bilangan bulat positif.");
}

const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000
  });

globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
