import { eq } from "drizzle-orm";

import { closeExamSession } from "@/lib/api/grading";
import { fail, handleError, ok } from "@/lib/api/http";
import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const [session] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId));

    if (!session) {
      return fail("Session not found", 404);
    }

    if (session.status !== "in_progress") {
      return fail("Session is already closed", 409);
    }

    const result = await closeExamSession(sessionId, "submitted");

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
