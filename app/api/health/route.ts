import { sql } from "drizzle-orm";

import { ok, handleError } from "@/lib/api/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await db.execute<{ ok: number }>(sql`select 1 as ok`);
    const [row] = result.rows;

    return ok({
      status: "ok",
      database: row?.ok === 1 ? "connected" : "unknown",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return handleError(error);
  }
}
