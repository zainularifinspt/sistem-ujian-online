import { eq } from "drizzle-orm";

import { closeExamSession } from "@/lib/api/grading";
import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { sessionId } = await context.params;
    const [session] = await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, sessionId));

    if (!session) {
      return fail("Session not found", 404);
    }

    const access = await requireExamAccess(admin, session.examId);

    if (access.error) {
      return access.error;
    }

    if (session.status !== "in_progress") {
      return fail("Session is already closed", 409);
    }

    const result = await closeExamSession(sessionId, "auto_submitted");

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
