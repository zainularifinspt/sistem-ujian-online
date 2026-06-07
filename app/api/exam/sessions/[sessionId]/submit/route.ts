import { eq } from "drizzle-orm";

import { closeExamSession } from "@/lib/api/grading";
import { fail, handleError, ok } from "@/lib/api/http";
import { db } from "@/lib/db";
import { answers, examSessions, questions } from "@/lib/db/schema";

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

    const isExpired = new Date() >= session.expiresAt;

    if (session.status !== "in_progress" && !(session.status === "expired" && isExpired)) {
      return fail("Session is already closed", 409);
    }

    if (!isExpired) {
      const examQuestions = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.examId, session.examId));

      if (examQuestions.length === 0) {
        return fail("Paket ujian belum memiliki soal.", 409);
      }

      const savedAnswers = await db
        .select({
          answer: answers.answer,
          questionId: answers.questionId
        })
        .from(answers)
        .where(eq(answers.sessionId, sessionId));
      const answerMap = new Map(
        savedAnswers.map((answer) => [answer.questionId, answer.answer ?? ""])
      );
      const answeredCount = examQuestions.filter((question) =>
        answerMap.get(question.id)?.trim()
      ).length;

      if (answeredCount < examQuestions.length) {
        return fail(
          `Lengkapi semua jawaban sebelum submit ujian. Terjawab ${answeredCount}/${examQuestions.length}.`,
          409
        );
      }
    }

    const result = await closeExamSession(
      sessionId,
      isExpired ? "auto_submitted" : "submitted"
    );

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
