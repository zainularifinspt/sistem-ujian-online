import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";

import { closeExamSession } from "@/lib/api/grading";
import { fail, handleError, ok } from "@/lib/api/http";
import { violationSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import {
  examParticipants,
  examSessions,
  violations
} from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const payload = violationSchema.parse(await request.json());
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

    const [violation] = await db
      .insert(violations)
      .values({
        id: randomUUID(),
        sessionId,
        type: payload.type,
        metadata: payload.metadata ?? null,
        createdAt: new Date()
      })
      .returning();

    const [counter] = await db
      .select({ value: count() })
      .from(violations)
      .where(eq(violations.sessionId, sessionId));

    await db
      .update(examParticipants)
      .set({
        violations: counter.value,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(examParticipants.examId, session.examId),
          eq(examParticipants.participantId, session.participantId)
        )
      );

    if (counter.value >= 3) {
      const submission = await closeExamSession(sessionId, "auto_submitted");

      return ok({
        violation,
        totalViolations: counter.value,
        autoSubmitted: true,
        submission
      });
    }

    return ok({
      violation,
      totalViolations: counter.value,
      autoSubmitted: false
    });
  } catch (error) {
    return handleError(error);
  }
}
