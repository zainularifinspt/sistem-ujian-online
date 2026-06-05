import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { fail, handleError, ok } from "@/lib/api/http";
import { saveAnswerSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { answers, examSessions, questions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const payload = saveAnswerSchema.parse(await request.json());
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

    if (new Date() > session.expiresAt) {
      await db
        .update(examSessions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(examSessions.id, sessionId));

      return fail("Session expired", 409);
    }

    const [question] = await db
      .select()
      .from(questions)
      .where(and(eq(questions.id, payload.questionId), eq(questions.examId, session.examId)));

    if (!question) {
      return fail("Question not found for this exam", 404);
    }

    const now = new Date();
    const [answer] = await db
      .insert(answers)
      .values({
        id: randomUUID(),
        sessionId,
        questionId: payload.questionId,
        answer: payload.answer ?? null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [answers.sessionId, answers.questionId],
        set: {
          answer: payload.answer ?? null,
          updatedAt: now
        }
      })
      .returning();

    return ok(answer);
  } catch (error) {
    return handleError(error);
  }
}
