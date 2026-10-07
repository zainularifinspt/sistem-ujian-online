import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { answers, exams, examParticipants, examSessions, gradingJobs, participants, questions, user } from "../lib/db/schema";
import { lockExamSession, saveAnswerBatch } from "../lib/api/answer-batch";
import { closeExamSession, regradeCompletedExam } from "../lib/api/grading";
import { runGradingJobs } from "../lib/api/grading-worker";
import { getStudentPayload } from "../lib/api/student-payload";
import { signStudentCredential, verifyStudentCredential, hasSameOrigin } from "../lib/api/student-session";
import { readJsonBody } from "../lib/api/body";
import { POST as startExam } from "../app/api/exam/start/route";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/ujian_test_")) {
  throw new Error("Integration tests require a dedicated local ujian_test_* database.");
}
const examId = randomUUID(), teacherId = randomUUID();
const ids = [randomUUID(), randomUUID(), randomUUID()];
let session: typeof examSessions.$inferSelect;
async function newSession(nim: string, targetExamId = examId) {
  const participantId = randomUUID();
  await db.insert(participants).values({ id: participantId, nim, name: nim, prodi: "Test", className: "Test" });
  await db.insert(examParticipants).values({ id: randomUUID(), examId: targetExamId, participantId, status: "in_progress" });
  const [created] = await db.insert(examSessions).values({ id: randomUUID(), examId: targetExamId, participantId,
    writerId: randomUUID(), startedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }).returning();
  return created;
}
before(async () => {
  await db.insert(user).values({ id: teacherId, name: "Test teacher", email: "teacher@test.invalid", emailVerified: true });
  await db.insert(exams).values({ id: examId, name: "Integration", token: "TEST", durationMinutes: 60,
    startAt: new Date(Date.now() - 10000), endAt: new Date(Date.now() + 3600000), status: "active", createdById: teacherId });
  await db.insert(questions).values([
    { id: ids[0], examId, order: 1, type: "short_answer", prompt: "Nilai satu per dua", answerKey: "\\(\\frac{1}{2}\\)", score: 2 },
    { id: ids[1], examId, order: 2, type: "multiple_choice", prompt: "Pilih jawaban", answerKey: "a", options: [{ id: "a", text: "Benar" }, { id: "b", text: "Salah" }], score: 3 },
    { id: ids[2], examId, order: 3, type: "essay", prompt: "Jelaskan alasan", score: 5 }
  ]);
  session = await newSession("TEST0001");
});
after(async () => {
  await db.delete(exams).where(eq(exams.id, examId));
  await db.delete(participants).where(sql`nim like 'TEST%'`);
  await db.delete(user).where(eq(user.id, teacherId));
  await pool.end();
});

test("credentials reject tampering, expiry and cross-origin requests", () => {
  const signed = signStudentCredential({ sessionId: "s", nonce: "n", expires: Date.now() + 10000 });
  assert.equal(verifyStudentCredential(signed)?.sessionId, "s");
  assert.equal(verifyStudentCredential(signed + "x"), null);
  assert.equal(verifyStudentCredential(signStudentCredential({ sessionId: "s", nonce: "n", expires: 0 })), null);
  assert.equal(hasSameOrigin(new Request("http://localhost/api", { headers: { origin: "https://attacker.invalid" } })), false);
  assert.equal(hasSameOrigin(new Request("http://localhost/api", { headers: { origin: "http://127.0.0.1:3001", host: "127.0.0.1:3001" } })), true);
  assert.equal(hasSameOrigin(new Request("http://localhost/api", { headers: { origin: "http://localhost", "sec-fetch-site": "cross-site" } })), false);
});

test("JSON body is bounded even without content-length", async () => {
  await assert.rejects(readJsonBody(new Request("http://localhost", { method: "POST", body: JSON.stringify({ value: "x".repeat(100) }) }), 20), /terlalu besar/);
});

test("concurrent saves cannot overwrite a newer session revision", async () => {
  const batch = { answers: [{ questionId: ids[0], answer: "1/2" }], expectedRevision: 0, writerId: session.writerId! };
  const outcomes = await Promise.allSettled([0, 1].map(() => db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, session.id), batch))));
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  const [saved] = await db.select().from(answers).where(eq(answers.sessionId, session.id));
  assert.equal(saved.answer, "1/2");
});

test("wrong writer and foreign question are rejected without advancing revision", async () => {
  await assert.rejects(db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, session.id), {
    answers: [{ questionId: ids[1], answer: "a" }], expectedRevision: 1, writerId: randomUUID()
  })), /tab lain/);
  await assert.rejects(db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, session.id), {
    answers: [{ questionId: randomUUID(), answer: "foreign" }], expectedRevision: 1, writerId: session.writerId!
  })), /Soal tidak sesuai/);
  const [fresh] = await db.select().from(examSessions).where(eq(examSessions.id, session.id));
  assert.equal(fresh.answerRevision, 1);
});

test("incomplete submit rolls back final answers; complete submit is atomic and idempotent", async () => {
  await assert.rejects(closeExamSession(session.id, "submitted", { requireComplete: true, batch: {
    expectedRevision: 1, writerId: session.writerId!, answers: [{ questionId: ids[1], answer: "a" }]
  } }), /Lengkapi/);
  const [fresh] = await db.select().from(examSessions).where(eq(examSessions.id, session.id));
  assert.equal(fresh.answerRevision, 1);
  const outcomes = await Promise.all(Array.from({ length: 10 }, () => closeExamSession(session.id, "submitted", {
    requireComplete: true, batch: { expectedRevision: 1, writerId: session.writerId!, answers: [
      { questionId: ids[1], answer: "a" }, { questionId: ids[2], answer: "Alasan saya" }
    ] }
  })));
  assert.equal(outcomes.every((result) => result.status === "submitted"), true);
  assert.equal(outcomes.filter((result) => !('alreadySubmitted' in result)).length, 1);
  assert.equal(outcomes[0].score, 5);
  const [registration] = await db.select().from(examParticipants).where(and(eq(examParticipants.examId, examId), eq(examParticipants.participantId, session.participantId)));
  assert.equal(registration.score, 5);
  await assert.rejects(db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, session.id), {
    expectedRevision: 2, writerId: session.writerId!, answers: [{ questionId: ids[0], answer: "wrong" }]
  })), /ditutup/);
});

test("expired final drafts are reported and do not bypass server deadline", async () => {
  const expired = await newSession("TESTEXPIRED");
  await db.update(examSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(examSessions.id, expired.id));
  const result = await closeExamSession(expired.id, "submitted", { batch: {
    expectedRevision: 0, writerId: expired.writerId!, answers: [{ questionId: ids[0], answer: "1/2" }]
  } });
  assert.equal(result.status, "auto_submitted");
  assert.equal(result.unsavedAnswers, true);
  assert.equal((await db.select().from(answers).where(eq(answers.sessionId, expired.id))).length, 0);
});

test("restart preserves pause, expiry, and deterministic question/option order", async () => {
  const paused = await newSession("TESTPAUSED");
  const expiry = new Date(Date.now() + 7200000);
  await db.update(examSessions).set({ status: "paused", pausedAt: new Date(), expiresAt: expiry }).where(eq(examSessions.id, paused.id));
  const response = await startExam(new Request("http://localhost/api/exam/start", { method: "POST", body: JSON.stringify({ nim: "TESTPAUSED", token: "TEST" }) }));
  assert.equal(response.status, 200);
  const payload = (await response.json()).data;
  assert.equal(payload.session.status, "paused");
  assert.equal(payload.session.expiresAt, expiry.toISOString());
  assert.ok(response.cookies.get("exam_access")?.value);
  assert.equal('authNonce' in payload.session, false);
  const [fresh] = await db.select().from(examSessions).where(eq(examSessions.id, paused.id));
  const a = await getStudentPayload(fresh), b = await getStudentPayload(fresh);
  assert.deepEqual(a.questions.map((q) => q.id), b.questions.map((q) => q.id));
  assert.equal(a.questions.some((q) => 'answerKey' in q), false);
});

test("AI failure remains pending/review; regrading preserves manual scores", async () => {
  const uncertain = await newSession("TESTREVIEW");
  await db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, uncertain.id), {
    expectedRevision: 0, writerId: uncertain.writerId!, answers: [{ questionId: ids[0], answer: "uncertain" }, { questionId: ids[2], answer: "manual" }]
  }));
  await closeExamSession(uncertain.id, "auto_submitted");
  const rows = await db.select().from(answers).where(eq(answers.sessionId, uncertain.id));
  const short = rows.find((row) => row.questionId === ids[0])!, essay = rows.find((row) => row.questionId === ids[2])!;
  await db.update(answers).set({ score: 4, gradedById: teacherId }).where(eq(answers.id, essay.id));
  await db.update(gradingJobs).set({ status: "pending", attempts: 0 }).where(eq(gradingJobs.answerId, short.id));
  await runGradingJobs(examId, async () => null);
  const [job] = await db.select().from(gradingJobs).where(eq(gradingJobs.answerId, short.id));
  assert.equal(job.status, "pending");
  assert.equal(job.attempts, 1);
  assert.equal((await db.select().from(answers).where(eq(answers.id, short.id)))[0].score, null);
  await db.update(gradingJobs).set({ availableAt: new Date(), attempts: 2 }).where(eq(gradingJobs.answerId, short.id));
  await runGradingJobs(examId, async () => null);
  assert.equal((await db.select().from(gradingJobs).where(eq(gradingJobs.answerId, short.id)))[0].status, "needs_review");
  await regradeCompletedExam(examId);
  assert.equal((await db.select().from(answers).where(eq(answers.id, essay.id)))[0].score, 4);
});

test("two worker invocations share the global AI concurrency limit", async () => {
  const targets = [];
  for (let i = 0; i < 3; i++) {
    const created = await newSession(`TESTWORKER${i}`);
    await db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, created.id), {
      expectedRevision: 0, writerId: created.writerId!, answers: [{ questionId: ids[0], answer: "needs review" }]
    }));
    await closeExamSession(created.id, "auto_submitted");
    const [answer] = await db.select().from(answers).where(eq(answers.sessionId, created.id));
    await db.update(gradingJobs).set({ status: "pending", availableAt: new Date(), attempts: 0 }).where(eq(gradingJobs.answerId, answer.id));
    targets.push(answer.id);
  }
  let release!: () => void, started!: () => void, calls = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const bothStarted = new Promise<void>((resolve) => { started = resolve; });
  const evaluate = async () => { if (++calls === 2) started(); await gate; return true; };
  const a = runGradingJobs(examId, evaluate), b = runGradingJobs(examId, evaluate);
  await bothStarted;
  assert.equal(calls, 2);
  release(); await Promise.all([a, b]);
  assert.equal(calls, 2);
  const statuses = await db.select().from(gradingJobs).where(sql`answer_id in (${sql.join(targets.map((id) => sql`${id}`), sql`, `)})`);
  assert.equal(statuses.filter((job) => job.status === "completed").length, 2);
  assert.equal(statuses.filter((job) => job.status === "pending").length, 1);
});

test("100 simulated participants save and submit with consistent scores", async () => {
  const sessions = await Promise.all(Array.from({ length: 100 }, (_, index) => newSession(`TESTLOAD${index.toString().padStart(4, '0')}`)));
  const durations: number[] = [];
  for (let start = 0; start < sessions.length; start += 10) {
    await Promise.all(sessions.slice(start, start + 10).map(async (created) => {
      const began = performance.now();
      const result = await closeExamSession(created.id, "submitted", { requireComplete: true, batch: {
        expectedRevision: 0, writerId: created.writerId!, answers: [
          { questionId: ids[0], answer: "1/2" }, { questionId: ids[1], answer: "a" }, { questionId: ids[2], answer: "Essay" }
        ]
      } });
      assert.equal(result.status, "submitted"); assert.equal(result.score, 5);
      durations.push(performance.now() - began);
    }));
  }
  durations.sort((a, b) => a - b);
  console.log(`LOCAL DATABASE ONLY: 100 participants, 10 concurrent submissions, p95=${Math.round(durations[94])}ms; not a hosting capacity benchmark.`);
});
