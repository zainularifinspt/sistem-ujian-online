import { and, eq, inArray, lte, or, sum, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { answers, examParticipants, examSessions, gradingJobs, questions } from "@/lib/db/schema";
import { answersMatchExactly } from "@/lib/math-answer";
import { lockExamSession, saveAnswerBatch, type AnswerBatch, type ExamTransaction } from "@/lib/api/answer-batch";
import { HttpError } from "@/lib/api/http";

export function hasAiGrading() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GROQ_API_KEY || process.env.GROK_API_KEY);
}

export async function gradeStoredAnswers(tx: ExamTransaction, session: typeof examSessions.$inferSelect, regrade = false) {
  const rows = await tx.select({ answerId: answers.id, answer: answers.answer, gradedById: answers.gradedById,
    type: questions.type, answerKey: questions.answerKey, score: questions.score }).from(questions)
    .leftJoin(answers, and(eq(answers.questionId, questions.id), eq(answers.sessionId, session.id)))
    .where(eq(questions.examId, session.examId));
  let pending = false;
  const scores: { id: string; score: number | null }[] = [];
  const jobs: (typeof gradingJobs.$inferInsert)[] = [];
  const completed: string[] = [];
  for (const row of rows) {
    if (!row.answerId || row.type === "essay" || row.gradedById) continue;
    const exact = row.answer && row.answerKey && answersMatchExactly(row.answerKey, row.answer);
    const uncertain = row.type === "short_answer" && Boolean(row.answer?.trim()) && !exact;
    scores.push({ id: row.answerId, score: uncertain ? null : exact ? row.score : 0 });
    if (uncertain) {
      pending = true;
      jobs.push({ answerId: row.answerId, status: hasAiGrading() && row.answerKey ? "pending" : "needs_review",
        attempts: 0, availableAt: new Date(), lease: randomUUID(), lockedAt: null });
    } else completed.push(row.answerId);
  }
  if (scores.length) {
    await tx.execute(sql`update answers a set score = v.score, updated_at = now()
      from (values ${sql.join(scores.map((row) => sql`(${row.id}::text, ${row.score}::real)`), sql`, `)}) as v(id, score)
      where a.id = v.id and a.graded_by_id is null`);
  }
  if (jobs.length) {
    const insert = tx.insert(gradingJobs).values(jobs);
    if (regrade) await insert.onConflictDoUpdate({ target: gradingJobs.answerId, set: {
      status: sql`excluded.status`, attempts: 0, availableAt: new Date(), lease: sql`excluded.lease`, lockedAt: null
    } });
    else await insert.onConflictDoNothing();
  }
  if (completed.length) await tx.delete(gradingJobs).where(inArray(gradingJobs.answerId, completed));
  const [total] = await tx.select({ score: sum(answers.score) }).from(answers).where(eq(answers.sessionId, session.id));
  const score = Number(total?.score ?? 0);
  await tx.update(examParticipants).set({ score, updatedAt: new Date() }).where(and(eq(examParticipants.examId, session.examId), eq(examParticipants.participantId, session.participantId)));
  return { score, gradingStatus: pending ? "pending_review" : "completed" };
}

export async function closeExamSession(sessionId: string, status: "submitted" | "auto_submitted",
  options?: { skipAi?: boolean; batch?: AnswerBatch; requireComplete?: boolean; regrade?: boolean }) {
  return db.transaction(async (tx) => {
    const session = await lockExamSession(tx, sessionId);
    const closed = ["submitted", "auto_submitted"].includes(session.status);
    if (closed && !options?.regrade) {
      const [registration] = await tx.select({ score: examParticipants.score }).from(examParticipants)
        .where(and(eq(examParticipants.examId, session.examId), eq(examParticipants.participantId, session.participantId)));
      return { sessionId, status: session.status, score: registration?.score, alreadySubmitted: true, unsavedAnswers: Boolean(options?.batch?.answers.length) };
    }
    const expired = session.expiresAt.getTime() <= Date.now();
    if (options?.requireComplete && session.status === "paused") throw new HttpError("Sesi sedang dijeda.", 409);
    let revision = session.answerRevision;
    if (options?.batch && !expired && !closed) revision = await saveAnswerBatch(tx, session, options.batch);
    if (options?.requireComplete && !expired && !closed) {
      const questionRows = await tx.select({ id: questions.id }).from(questions).where(eq(questions.examId, session.examId));
      const saved = await tx.select({ id: answers.questionId, answer: answers.answer }).from(answers).where(eq(answers.sessionId, sessionId));
      const present = new Set(saved.filter((row) => row.answer?.trim()).map((row) => row.id));
      if (!questionRows.length || questionRows.some((row) => !present.has(row.id))) throw new HttpError("Lengkapi semua jawaban sebelum submit.", 409);
    }
    const now = new Date(), submittedAt = session.submittedAt ?? (expired ? session.expiresAt : now);
    const finalStatus = closed ? session.status as "submitted" | "auto_submitted" : expired ? "auto_submitted" : status;
    await tx.update(examSessions).set({ status: finalStatus, submittedAt, updatedAt: now }).where(eq(examSessions.id, sessionId));
    await tx.update(examParticipants).set({ status: finalStatus, submittedAt, updatedAt: now })
      .where(and(eq(examParticipants.examId, session.examId), eq(examParticipants.participantId, session.participantId)));
    const result = await gradeStoredAnswers(tx, session, options?.regrade);
    return { sessionId, status: finalStatus, revision, ...result,
      unsavedAnswers: expired && Boolean(options?.batch?.answers.length) };
  });
}

export async function closeOverdueSessions(examId?: string, limit = 50) {
  const due = await db.select({ id: examSessions.id }).from(examSessions).where(and(
    examId ? eq(examSessions.examId, examId) : undefined,
    or(eq(examSessions.status, "expired"), and(eq(examSessions.status, "in_progress"), lte(examSessions.expiresAt, new Date())))
  )).limit(limit);
  for (const row of due) await closeExamSession(row.id, "auto_submitted");
  return due.length;
}

export async function regradeCompletedExam(examId: string) {
  const sessions = await db.select({ id: examSessions.id }).from(examSessions).where(and(eq(examSessions.examId, examId),
    or(inArray(examSessions.status, ["submitted", "auto_submitted", "expired"]), and(eq(examSessions.status, "in_progress"), lte(examSessions.expiresAt, new Date())))));
  for (const session of sessions) await closeExamSession(session.id, "auto_submitted", { regrade: true });
  return sessions.length;
}
