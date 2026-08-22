import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { createUniqueExamToken } from "@/lib/api/exam-token";
import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import { exams, questions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
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

    const sourceQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(questions.order);
    const now = new Date();
    const copiedExamId = randomUUID();
    const token = await createUniqueExamToken();

    const copiedExam = await db.transaction(async (tx) => {
      const [createdExam] = await tx
        .insert(exams)
        .values({
          id: copiedExamId,
          name: `${access.exam.name} (Salinan)`,
          description: access.exam.description,
          token,
          tokenRotatedAt: now,
          durationMinutes: access.exam.durationMinutes,
          violationLimit: access.exam.violationLimit,
          enabledViolationTypes: access.exam.enabledViolationTypes,
          startAt: access.exam.startAt,
          endAt: access.exam.endAt,
          shuffleQuestions: access.exam.shuffleQuestions,
          shuffleOptions: access.exam.shuffleOptions,
          status: "draft",
          createdById: admin.id,
          createdAt: now,
          updatedAt: now
        })
        .returning();

      if (sourceQuestions.length > 0) {
        await tx.insert(questions).values(
          sourceQuestions.map((question) => ({
            id: randomUUID(),
            examId: copiedExamId,
            order: question.order,
            type: question.type,
            prompt: question.prompt,
            imageUrl: question.imageUrl,
            options: question.options,
            answerKey: question.answerKey,
            score: question.score,
            createdAt: now,
            updatedAt: now
          }))
        );
      }

      return createdExam;
    });

    const questionMix = sourceQuestions.reduce(
      (mix, question) => {
        if (question.type === "multiple_choice") {
          mix.multipleChoice += 1;
        } else if (question.type === "short_answer") {
          mix.shortAnswer += 1;
        } else {
          mix.essay += 1;
        }
        return mix;
      },
      { essay: 0, multipleChoice: 0, shortAnswer: 0 }
    );

    return ok(
      {
        ...copiedExam,
        participants: 0,
        submitted: 0,
        loggedIn: 0,
        questions: sourceQuestions.length,
        questionMix,
        needsGrading: 0
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
