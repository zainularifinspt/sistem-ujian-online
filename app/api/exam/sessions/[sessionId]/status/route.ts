import { eq } from "drizzle-orm";

import { fail, handleError, ok } from "@/lib/api/http";
import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const [session] = await db
      .select({
        id: examSessions.id,
        status: examSessions.status,
        expiresAt: examSessions.expiresAt,
        submittedAt: examSessions.submittedAt
      })
      .from(examSessions)
      .where(eq(examSessions.id, sessionId));

    if (!session) {
      return fail("Session not found", 404);
    }

    return ok(session);
  } catch (error) {
    return handleError(error);
  }
}
