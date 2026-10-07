import { randomUUID } from "node:crypto";
import { and, eq, sql, sum } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db";
import { answers, examParticipants, examSessions, gradingJobs, questions } from "@/lib/db/schema";
import { evaluateShortAnswerWithAI } from "@/lib/api/ai-grading";

/** Database leases enforce two AI jobs globally, even across server instances. */
export async function runGradingJobs(examId?: string, evaluate = evaluateShortAnswerWithAI) {
  const jobs = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(17062026)`);
    await tx.execute(sql`update grading_jobs set status = case when attempts >= 3 then 'needs_review' else 'pending' end,
      lease = null, locked_at = null, available_at = now()
      where status = 'processing' and locked_at < now() - interval '2 minutes'`);
    const active = await tx.execute<{ total: number }>(sql`select count(*)::int as total from grading_jobs where status = 'processing'`);
    const slots = Math.max(0, 2 - Number(active.rows[0]?.total ?? 0));
    if (!slots) return [];
    const ready = await tx.execute<{ answerId: string }>(sql`
      select j.answer_id as "answerId" from grading_jobs j
      join answers a on a.id = j.answer_id join exam_sessions s on s.id = a.session_id
      where j.status = 'pending' and j.available_at <= now()
        and s.status in ('submitted', 'auto_submitted')
        ${examId ? sql`and s.exam_id = ${examId}` : sql``}
      order by j.available_at limit ${slots} for update of j skip locked
    `);
    const claimed = [];
    for (const row of ready.rows) {
      const lease = randomUUID();
      await tx.update(gradingJobs).set({ status: "processing", lease, lockedAt: new Date(),
        attempts: sql`${gradingJobs.attempts} + 1` }).where(eq(gradingJobs.answerId, row.answerId));
      claimed.push({ ...row, lease });
    }
    return claimed;
  });
  await Promise.all(jobs.map(async (job) => {
    const [input] = await db.select({ prompt: questions.prompt, key: questions.answerKey, answer: answers.answer,
      sessionId: answers.sessionId, gradedById: answers.gradedById, maxScore: questions.score })
      .from(answers).innerJoin(questions, eq(questions.id, answers.questionId)).where(eq(answers.id, job.answerId));
    let result: boolean | null = null;
    try {
      if (input?.answer && input.key && !input.gradedById) result = await evaluate(input.prompt, input.key, input.answer);
    } catch { /* Durable retry below; never convert provider failure to an incorrect answer. */ }
    await db.transaction(async (tx) => {
      if (input) await tx.select({ id: examSessions.id }).from(examSessions).where(eq(examSessions.id, input.sessionId)).for("update");
      const [current] = await tx.select().from(gradingJobs).where(eq(gradingJobs.answerId, job.answerId)).for("update");
      if (!current || current.lease !== job.lease) return;
      const [answer] = await tx.select().from(answers).where(eq(answers.id, job.answerId)).for("update");
      if (!answer) return;
      if (answer.gradedById) {
        await tx.update(gradingJobs).set({ status: "completed", lease: null, lockedAt: null }).where(eq(gradingJobs.answerId, job.answerId));
        return;
      }
      if (result === null || !input || answer.answer !== input.answer) {
        await tx.update(gradingJobs).set({ status: current.attempts >= 3 ? "needs_review" : "pending",
          availableAt: new Date(Date.now() + 30000 * 2 ** current.attempts), lease: null, lockedAt: null }).where(eq(gradingJobs.answerId, job.answerId));
        return;
      }
      await tx.update(answers).set({ score: result ? input.maxScore : 0, updatedAt: new Date() }).where(eq(answers.id, job.answerId));
      await tx.update(gradingJobs).set({ status: "completed", lease: null, lockedAt: null }).where(eq(gradingJobs.answerId, job.answerId));
      const [session] = await tx.select().from(examSessions).where(eq(examSessions.id, input.sessionId));
      const [total] = await tx.select({ score: sum(answers.score) }).from(answers).where(eq(answers.sessionId, input.sessionId));
      await tx.update(examParticipants).set({ score: Number(total?.score ?? 0), updatedAt: new Date() })
        .where(and(eq(examParticipants.examId, session.examId), eq(examParticipants.participantId, session.participantId)));
    });
  }));
  return jobs.length;
}

export function scheduleGrading(examId?: string) {
  after(async () => { await runGradingJobs(examId); });
}
