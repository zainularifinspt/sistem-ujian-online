import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { answers, examSessions, exams, participants, questions, violations } from "@/lib/db/schema";
import { detectAnswerFormat } from "@/lib/math-answer";

function stableShuffle<T extends { id: string }>(items: T[], seed: string) {
  const rank = (id: string) => createHash("sha256").update(`${seed}:${id}`).digest("hex");
  return [...items].sort((a, b) => rank(a.id).localeCompare(rank(b.id)));
}

export async function getStudentPayload(session: typeof examSessions.$inferSelect) {
  const [examRows, participantRows, questionRows, savedAnswers, counters] = await Promise.all([
    db.select().from(exams).where(eq(exams.id, session.examId)),
    db.select().from(participants).where(eq(participants.id, session.participantId)),
    db.select().from(questions).where(eq(questions.examId, session.examId)).orderBy(questions.order),
    db.select({ questionId: answers.questionId, answer: answers.answer }).from(answers).where(eq(answers.sessionId, session.id)),
    db.select({ value: count() }).from(violations).where(eq(violations.sessionId, session.id))
  ]);
  const exam = examRows[0], participant = participantRows[0];
  if (!exam || !participant) throw new Error("Sesi ujian tidak tersedia.");
  const prepared = exam.shuffleQuestions ? stableShuffle(questionRows, session.id) : questionRows;
  return {
    session: { id: session.id, status: session.status, startedAt: session.startedAt, expiresAt: session.expiresAt,
      answerRevision: session.answerRevision, writerId: session.writerId },
    exam: { id: exam.id, name: exam.name, description: exam.description, durationMinutes: exam.durationMinutes,
      violationLimit: exam.violationLimit, enabledViolationTypes: exam.enabledViolationTypes,
      shuffleQuestions: exam.shuffleQuestions, shuffleOptions: exam.shuffleOptions },
    participant: { name: participant.name, nim: participant.nim, prodi: participant.prodi, className: participant.className },
    violations: counters[0]?.value ?? 0,
    answers: Object.fromEntries(savedAnswers.map((row) => [row.questionId, row.answer ?? ""])),
    questions: prepared.map(({ answerKey, examId: _examId, createdAt: _createdAt, updatedAt: _updatedAt, ...question }) => {
      void _examId; void _createdAt; void _updatedAt;
      return { ...question, answerFormat: detectAnswerFormat(answerKey),
        options: exam.shuffleOptions && question.options ? stableShuffle(question.options, `${session.id}:${question.id}`) : question.options };
    })
  };
}

export async function claimStudentWriter(sessionId: string) {
  const [session] = await db.update(examSessions).set({ writerId: crypto.randomUUID() })
    .where(and(eq(examSessions.id, sessionId))) .returning();
  return session;
}
