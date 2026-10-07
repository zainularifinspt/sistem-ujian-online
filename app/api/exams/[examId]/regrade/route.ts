import { scheduleGrading } from "@/lib/api/grading-worker";
import { and, count, eq, inArray, lte, or } from "drizzle-orm";

import { regradeCompletedExam } from "@/lib/api/grading";
import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import {
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
      regradedSessionsCount = await regradeCompletedExam(examId);
    }

    scheduleGrading(examId);
    return ok({
      success: true,
      updatedQuestionsCount: updates.length,
      regradedSessionsCount
    });
  } catch (error) {
    return handleError(error);
  }
}
