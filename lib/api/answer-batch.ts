import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, examSessions, questions } from "@/lib/db/schema";
import { HttpError } from "@/lib/api/http";
import type { answerBatchSchema } from "@/lib/api/validators";
import type { z } from "zod";

export type AnswerBatch = z.infer<typeof answerBatchSchema>;
export type ExamTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockExamSession(tx: ExamTransaction, sessionId: string) {
  const [session] = await tx.select().from(examSessions).where(eq(examSessions.id, sessionId)).for("update");
  if (!session) throw new HttpError("Sesi tidak ditemukan.", 404);
  return session;
}

export async function saveAnswerBatch(tx: ExamTransaction, session: typeof examSessions.$inferSelect, batch: AnswerBatch) {
  if (session.status !== "in_progress") throw new HttpError("Sesi dijeda atau sudah ditutup.", 409);
  if (session.expiresAt.getTime() <= Date.now()) throw new HttpError("Waktu ujian sudah habis. Draf belum tersinkron tetap disimpan di perangkat.", 409);
  if (session.writerId !== batch.writerId) throw new HttpError("Sesi digunakan di tab lain. Muat ulang untuk melanjutkan.", 409);
  if (session.answerRevision !== batch.expectedRevision) throw new HttpError("Versi jawaban berubah. Muat ulang untuk melanjutkan.", 409);
  if (!batch.answers.length) return session.answerRevision;
  const ids = batch.answers.map((row) => row.questionId);
  const allowed = await tx.select({ id: questions.id, examId: questions.examId }).from(questions).where(inArray(questions.id, ids));
  if (allowed.length !== ids.length || allowed.some((row) => row.examId !== session.examId)) {
    throw new HttpError("Soal tidak sesuai dengan sesi ujian.", 422);
  }
  const now = new Date();
  await tx.insert(answers).values(batch.answers.map((row) => ({ id: randomUUID(), sessionId: session.id,
    questionId: row.questionId, answer: row.answer ?? "", createdAt: now, updatedAt: now })))
    .onConflictDoUpdate({ target: [answers.sessionId, answers.questionId], set: { answer: sql`excluded.answer`, updatedAt: now } });
  const revision = session.answerRevision + 1;
  await tx.update(examSessions).set({ answerRevision: revision }).where(eq(examSessions.id, session.id));
  return revision;
}
