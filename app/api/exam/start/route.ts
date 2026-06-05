import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { fail, handleError, ok } from "@/lib/api/http";
import { startExamSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import {
  examParticipants,
  examSessions,
  exams,
  participants,
  questions
} from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { nim, token } = startExamSchema.parse(await request.json());
    const now = new Date();
    const [exam] = await db.select().from(exams).where(eq(exams.token, token));

    if (!exam) {
      return fail("Token ujian tidak valid", 404);
    }

    if (exam.status !== "active") {
      return fail("Ujian belum aktif", 403);
    }

    if (now < exam.startAt || now > exam.endAt) {
      return fail("Ujian di luar jadwal", 403);
    }

    const [participant] = await db
      .select()
      .from(participants)
      .where(eq(participants.nim, nim));

    if (!participant) {
      return fail("NIM belum terdaftar", 404);
    }

    const [registration] = await db
      .select()
      .from(examParticipants)
      .where(
        and(
          eq(examParticipants.examId, exam.id),
          eq(examParticipants.participantId, participant.id)
        )
      );

    if (!registration) {
      return fail("Peserta tidak terdaftar pada ujian ini", 403);
    }

    if (registration.status === "submitted" || registration.status === "auto_submitted") {
      return fail("Peserta sudah submit ujian", 409);
    }

    const expiresAt = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const [session] = await db
      .insert(examSessions)
      .values({
        id: randomUUID(),
        examId: exam.id,
        participantId: participant.id,
        startedAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [examSessions.examId, examSessions.participantId],
        set: {
          status: "in_progress",
          updatedAt: now
        }
      })
      .returning();

    await db
      .update(examParticipants)
      .set({
        status: "in_progress",
        startedAt: registration.startedAt ?? now,
        updatedAt: now
      })
      .where(eq(examParticipants.id, registration.id));

    const examQuestions = await db
      .select({
        id: questions.id,
        order: questions.order,
        type: questions.type,
        prompt: questions.prompt,
        options: questions.options,
        score: questions.score
      })
      .from(questions)
      .where(eq(questions.examId, exam.id))
      .orderBy(questions.order);

    return ok({
      session,
      exam: {
        id: exam.id,
        name: exam.name,
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        shuffleQuestions: exam.shuffleQuestions,
        shuffleOptions: exam.shuffleOptions
      },
      participant,
      questions: examQuestions
    });
  } catch (error) {
    return handleError(error);
  }
}
