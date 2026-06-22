import { eq } from "drizzle-orm";

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

    const now = new Date();

    if (session.status === "in_progress") {
      // Pause the session: set status to "paused", record pausedAt
      await db
        .update(examSessions)
        .set({
          status: "paused",
          pausedAt: now,
          updatedAt: now
        })
        .where(eq(examSessions.id, sessionId));

      return ok({ status: "paused" });
    } else if (session.status === "paused") {
      // Resume the session: calculate pause duration and extend expiresAt
      const pausedAtTime = session.pausedAt ? new Date(session.pausedAt).getTime() : now.getTime();
      const pauseDurationMs = now.getTime() - pausedAtTime;

      // Extend expiration time by the pause duration
      const newExpiresAt = new Date(new Date(session.expiresAt).getTime() + pauseDurationMs);

      await db
        .update(examSessions)
        .set({
          status: "in_progress",
          expiresAt: newExpiresAt,
          pausedAt: null,
          updatedAt: now
        })
        .where(eq(examSessions.id, sessionId));

      return ok({ status: "in_progress", expiresAt: newExpiresAt.toISOString() });
    } else {
      return fail(`Cannot toggle pause for session with status: ${session.status}`, 400);
    }
  } catch (error) {
    return handleError(error);
  }
}
