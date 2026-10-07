import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { closeOverdueSessions } from "@/lib/api/grading";
import { runGradingJobs } from "@/lib/api/grading-worker";
import { refreshActiveExamTokens } from "@/lib/api/exam-token";
import { fail, handleError, ok } from "@/lib/api/http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return fail("Unauthorized", 401);
  try {
    const closed = await closeOverdueSessions(undefined, 25);
    await refreshActiveExamTokens();
    await db.delete(loginAttempts).where(lt(loginAttempts.expiresAt, new Date(Date.now() - 86400000)));
    return ok({ closed, graded: await runGradingJobs() });
  } catch (error) { return handleError(error); }
}
