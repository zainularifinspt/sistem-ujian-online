import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { createQuestionSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { answers, questions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

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

    const payload = createQuestionSchema.parse(await request.json());
    const now = new Date();
    const [question] = await db
      .insert(questions)
      .values({
        id: randomUUID(),
        examId,
        ...payload,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return ok(question, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
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

    // Safeguard: Check if exam already has participant answers to prevent accidental cascade delete
    const [hasExistingAnswer] = await db
      .select({ id: answers.id })
      .from(answers)
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .where(eq(questions.examId, examId))
      .limit(1);

    if (hasExistingAnswer) {
      return fail(
        "Paket ujian ini sudah memiliki lembar jawaban peserta yang tersimpan. Mengganti butir soal dari sini akan menghapus riwayat jawaban peserta. Untuk mengubah kunci jawaban secara aman dan menghitung ulang skor, gunakan fitur 'Kunci Jawaban & Hitung Ulang' di menu Penilaian.",
        409
      );
    }

    const payload = (await request.json()) as unknown;
    const parsedQuestions = createQuestionSchema.array().min(1).parse(payload);
    const now = new Date();

    await db.delete(questions).where(eq(questions.examId, examId));

    const insertedQuestions = await db
      .insert(questions)
      .values(
        parsedQuestions.map((question) => ({
          id: randomUUID(),
          examId,
          ...question,
          createdAt: now,
          updatedAt: now
        }))
      )
      .returning();

    return ok(insertedQuestions);
  } catch (error) {
    return handleError(error);
  }
}
