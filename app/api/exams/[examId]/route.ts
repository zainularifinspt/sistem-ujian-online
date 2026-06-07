import { eq } from "drizzle-orm";

import {
  createUniqueExamToken,
  refreshExamTokenIfNeeded
} from "@/lib/api/exam-token";
import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { updateExamSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import {
  examParticipants,
  exams,
  participants,
  questions
} from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
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
    let exam = access.exam;
    if (exam.status === "active" && new Date() > new Date(exam.endAt)) {
      const now = new Date();
      const [updated] = await db
        .update(exams)
        .set({ status: "finished", updatedAt: now })
        .where(eq(exams.id, examId))
        .returning();
      if (updated) {
        exam = updated;
      }
    }
    exam = await refreshExamTokenIfNeeded(exam);

    const examQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(questions.order);

    const roster = await db
      .select({
        id: examParticipants.id,
        status: examParticipants.status,
        score: examParticipants.score,
        violations: examParticipants.violations,
        startedAt: examParticipants.startedAt,
        submittedAt: examParticipants.submittedAt,
        participant: participants
      })
      .from(examParticipants)
      .innerJoin(participants, eq(examParticipants.participantId, participants.id))
      .where(eq(examParticipants.examId, examId));

    return ok({ ...exam, questions: examQuestions, roster });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId } = await context.params;
    const payload = updateExamSchema.parse(await request.json());
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    if (Object.keys(payload).length === 0) {
      return fail("No fields to update", 400);
    }

    const now = new Date();
    const tokenUpdate =
      payload.status === "active"
        ? {
            token: await createUniqueExamToken(examId),
            tokenRotatedAt: now
          }
        : {};
    const [exam] = await db
      .update(exams)
      .set({
        ...payload,
        ...tokenUpdate,
        updatedAt: now
      })
      .where(eq(exams.id, examId))
      .returning();

    if (!exam) {
      return fail("Exam not found", 404);
    }

    return ok(exam);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

    const [exam] = await db
      .delete(exams)
      .where(eq(exams.id, examId))
      .returning();

    if (!exam) {
      return fail("Exam not found", 404);
    }

    return ok({ deleted: true, id: exam.id });
  } catch (error) {
    return handleError(error);
  }
}
