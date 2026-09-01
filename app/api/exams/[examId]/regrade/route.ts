import { and, count, eq, inArray, lte, or, sum } from "drizzle-orm";

import { evaluateShortAnswerWithAI } from "@/lib/api/ai-grading";
import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import {
  answers,
  examParticipants,
  examSessions,
  questions
} from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

type QuestionUpdatePayload = {
  questionId: string;
  answerKey: string | null;
};

type RegradeRequestBody = {
  updates?: QuestionUpdatePayload[];
  regrade?: boolean;
};

function normalizeAnswer(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId } = await context.params;
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const examQuestions = await db
      .select({
        id: questions.id,
        order: questions.order,
        type: questions.type,
        prompt: questions.prompt,
        imageUrl: questions.imageUrl,
        options: questions.options,
        answerKey: questions.answerKey,
        score: questions.score
      })
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(questions.order);

    const [sessionCountResult] = await db
      .select({ total: count() })
      .from(examSessions)
      .where(
        and(
          eq(examSessions.examId, examId),
          or(
            inArray(examSessions.status, ["submitted", "auto_submitted", "expired"]),
            and(
              eq(examSessions.status, "in_progress"),
              lte(examSessions.expiresAt, new Date())
            )
          )
        )
      );

    return ok({
      questions: examQuestions,
      submittedSessionsCount: Number(sessionCountResult?.total ?? 0)
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId } = await context.params;
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const body = (await request.json().catch(() => ({}))) as RegradeRequestBody;
    const { updates = [], regrade = true } = body;

    const now = new Date();

    // 1. In-place update question answer keys safely without deleting any records
    for (const update of updates) {
      if (!update.questionId) continue;

      await db
        .update(questions)
        .set({
          answerKey: update.answerKey?.trim() || null,
          updatedAt: now
        })
        .where(
          and(
            eq(questions.id, update.questionId),
            eq(questions.examId, examId)
          )
        );
    }

    let regradedSessionsCount = 0;

    // 2. Perform automatic recalculation if requested
    if (regrade) {
      // Get the latest question list with updated answer keys
      const currentQuestions = await db
        .select()
        .from(questions)
        .where(eq(questions.examId, examId))
        .orderBy(questions.order);

      const questionMap = new Map(
        currentQuestions.map((question) => [question.id, question])
      );

      // Get all completed, expired, or overdue sessions for this exam
      const sessions = await db
        .select()
        .from(examSessions)
        .where(
          and(
            eq(examSessions.examId, examId),
            or(
              inArray(examSessions.status, ["submitted", "auto_submitted", "expired"]),
              and(
                eq(examSessions.status, "in_progress"),
                lte(examSessions.expiresAt, now)
              )
            )
          )
        );

      for (const session of sessions) {
        // Ensure session has proper submitted status & submittedAt timestamp
        const submittedAt =
          session.submittedAt ??
          (session.expiresAt && session.expiresAt < now ? session.expiresAt : now);

        if (session.status === "expired" || session.status === "in_progress" || !session.submittedAt) {
          await db
            .update(examSessions)
            .set({
              status: "auto_submitted",
              submittedAt,
              updatedAt: now
            })
            .where(eq(examSessions.id, session.id));

          await db
            .update(examParticipants)
            .set({
              status: "auto_submitted",
              submittedAt,
              updatedAt: now
            })
            .where(
              and(
                eq(examParticipants.examId, examId),
                eq(examParticipants.participantId, session.participantId)
              )
            );
        }

        const studentAnswers = await db
          .select()
          .from(answers)
          .where(eq(answers.sessionId, session.id));

        for (const studentAnswer of studentAnswers) {
          const q = questionMap.get(studentAnswer.questionId);
          if (!q) continue;

          // Multiple Choice: compare student's selected option with new answerKey
          if (q.type === "multiple_choice") {
            const isCorrect =
              normalizeAnswer(studentAnswer.answer) ===
              normalizeAnswer(q.answerKey);
            const score = isCorrect ? q.score : 0;

            await db
              .update(answers)
              .set({
                score,
                updatedAt: now
              })
              .where(eq(answers.id, studentAnswer.id));
          }

          // Short Answer: evaluate with fast path exact match or AI
          if (q.type === "short_answer") {
            let score = 0;
            if (studentAnswer.answer && q.answerKey) {
              const isCorrect = await evaluateShortAnswerWithAI(
                q.prompt,
                q.answerKey,
                studentAnswer.answer
              );
              score = isCorrect ? q.score : 0;
              // Brief pause between AI calls to avoid burst rate limits
              await new Promise((r) => setTimeout(r, 100));
            } else {
              score =
                normalizeAnswer(studentAnswer.answer) ===
                normalizeAnswer(q.answerKey)
                  ? q.score
                  : 0;
            }

            await db
              .update(answers)
              .set({
                score,
                updatedAt: now
              })
              .where(eq(answers.id, studentAnswer.id));
          }

          // Essay: PRESERVE manual scores already evaluated by teacher!
          // We do not change essay scores here.
        }

        // Recalculate total score for this session
        const [scoreResult] = await db
          .select({ total: sum(answers.score) })
          .from(answers)
          .where(eq(answers.sessionId, session.id));

        const totalScore = Number(scoreResult?.total ?? 0);

        // Update examParticipants with recalculated score
        await db
          .update(examParticipants)
          .set({
            score: totalScore,
            updatedAt: now
          })
          .where(
            and(
              eq(examParticipants.examId, examId),
              eq(examParticipants.participantId, session.participantId)
            )
          );

        regradedSessionsCount++;
      }
    }

    return ok({
      success: true,
      updatedQuestionsCount: updates.length,
      regradedSessionsCount
    });
  } catch (error) {
    return handleError(error);
  }
}
