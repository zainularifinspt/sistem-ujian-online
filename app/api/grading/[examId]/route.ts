import { z } from "zod";
import { readJsonBody } from "@/lib/api/body";
import { lockExamSession } from "@/lib/api/answer-batch";
import { closeOverdueSessions } from "@/lib/api/grading";
import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql, sum } from "drizzle-orm";

import {
  fail,
  handleError,
  HttpError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import { detectAnswerFormat, type AnswerFormat } from "@/lib/math-answer";
import {
  answers,
  examParticipants,
  examSessions,
  participants,
  questions,
  gradingJobs
} from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

type GradingAnswerDetail = {
  answerFormat?: AnswerFormat;
  questionId: string;
  order: number;
  type: "essay" | "multiple_choice" | "short_answer";
  prompt: string;
  imageUrl: string | null;
  studentAnswer: string | null;
  correctKey: string | null;
  isCorrect: boolean;
  score: number | null;
  options: { id: string; text: string; imageUrl?: string | null }[] | null;
};

type GradingStudent = {
  autoShortMax: number;
  autoShortScore: number;
  essays: {
    answer: string;
    answerFormat?: AnswerFormat;
    feedback: string;
    id: string;
    imageUrl?: string | null;
    maxScore: number;
    question: string;
    rubric: string;
    score: number | null;
    type: "essay" | "short_answer";
  }[];
  kelas: string;
  mcMax: number;
  mcScore: number;
  name: string;
  nim: string;
  prodi: string;
  submittedAt: string;
  answersDetail: GradingAnswerDetail[];
};

function formatSubmittedAt(value: Date | string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar"
  });
}

export async function GET(request: Request, context: RouteContext) {
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

    await closeOverdueSessions(examId);
    const params = new URL(request.url).searchParams;
    const paginated = params.has("page");
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get("page")) || 1)));
    const pageSize = 25;
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const searchFilter = search ? sql`and (p.name ilike ${`%${search}%`} or p.nim ilike ${`%${search}%`} or p.prodi ilike ${`%${search}%`})` : sql``;
    const pageClause = paginated ? sql`limit ${pageSize} offset ${(page - 1) * pageSize}` : sql``;


    // 2. Run questions, participants, and answers queries concurrently
    const [questionsRows, participantRows, answerRows, totals] = await Promise.all([
      db
        .select({
          id: questions.id,
          order: questions.order,
          type: questions.type,
          prompt: questions.prompt,
          imageUrl: questions.imageUrl,
          answerKey: questions.answerKey,
          options: questions.options,
          score: questions.score
        })
        .from(questions)
        .where(eq(questions.examId, examId))
        .orderBy(questions.order),

      db.execute<{
        participantId: string;
        nim: string;
        name: string;
        prodi: string;
        className: string;
        submittedAt: Date | string | null;
        sessionId: string | null;
      }>(sql`
        select
          p.id as "participantId",
          p.nim,
          p.name,
          p.prodi,
          p.class_name as "className",
          coalesce(ep.submitted_at, es.submitted_at) as "submittedAt",
          es.id as "sessionId"
        from exam_participants ep
        join participants p on p.id = ep.participant_id
        left join exam_sessions es
          on es.exam_id = ep.exam_id
         and es.participant_id = ep.participant_id
        where ep.exam_id = ${examId} ${searchFilter}
        order by p.name asc, p.id asc ${pageClause}
      `),

      db.execute<{
        sessionId: string;
        questionId: string;
        answer: string | null;
        score: number | null;
      }>(sql`
        select
          a.session_id as "sessionId",
          a.question_id as "questionId",
          a.answer,
          a.score
        from answers a
        join exam_sessions es on es.id = a.session_id
        where es.exam_id = ${examId}
        and es.participant_id in (
          select p.id from exam_participants ep join participants p on p.id = ep.participant_id
          where ep.exam_id = ${examId} ${searchFilter}
          order by p.name asc, p.id asc ${pageClause}
        )
      `),
      db.execute<{ total: number }>(sql`select count(*)::int as total from exam_participants ep
        join participants p on p.id = ep.participant_id where ep.exam_id = ${examId} ${searchFilter}`)
    ]);

    // 3. Assemble students efficiently in memory
    const answerMap = new Map<string, { answer: string | null; score: number | null }>();
    for (const ans of answerRows.rows) {
      answerMap.set(`${ans.sessionId}_${ans.questionId}`, {
        answer: ans.answer,
        score: ans.score
      });
    }

    const students: GradingStudent[] = [];

    for (const p of participantRows.rows) {
      const student: GradingStudent = {
        autoShortMax: 0,
        autoShortScore: 0,
        essays: [],
        kelas: p.className,
        mcMax: 0,
        mcScore: 0,
        name: p.name,
        nim: p.nim,
        prodi: p.prodi,
        submittedAt: formatSubmittedAt(p.submittedAt),
        answersDetail: []
      };

      for (const q of questionsRows) {
        const ans = p.sessionId ? answerMap.get(`${p.sessionId}_${q.id}`) : undefined;
        const studentAnswer = ans?.answer ?? null;
        const answerScore = ans?.score ?? null;
        const isCorrect = answerScore !== null && answerScore > 0;

        student.answersDetail.push({
          answerFormat: detectAnswerFormat(q.answerKey),
          questionId: q.id,
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          imageUrl: q.imageUrl,
          studentAnswer,
          correctKey: q.answerKey,
          isCorrect,
          score: answerScore,
          options: q.options
        });

        if (q.type === "multiple_choice") {
          student.mcMax += q.score;
          student.mcScore += answerScore ?? 0;
        }

        if (q.type === "short_answer") {
          student.autoShortMax += q.score;
          student.autoShortScore += answerScore ?? 0;
          student.essays.push({
            type: "short_answer",
            answerFormat: detectAnswerFormat(q.answerKey),
            answer: studentAnswer ?? "Belum ada jawaban tersimpan.",
            feedback: "",
            id: q.id,
            imageUrl: q.imageUrl,
            maxScore: q.score,
            question: q.prompt,
            rubric: `Isian Singkat. Kunci Jawaban: ${q.answerKey ?? "-"} (Penilaian awal oleh AI)`,
            score: answerScore
          });
        }

        if (q.type === "essay") {
          student.essays.push({
            type: "essay",
            answerFormat: "text",
            answer: studentAnswer ?? "Belum ada jawaban esai tersimpan.",
            feedback: "",
            id: q.id,
            imageUrl: q.imageUrl,
            maxScore: q.score,
            question: q.prompt,
            rubric: "Nilai berdasarkan ketepatan konsep, argumentasi, contoh, dan kejelasan.",
            score: answerScore
          });
        }
      }

      students.push(student);
    }

    return ok(paginated ? { students, page, pageSize, total: totals.rows[0]?.total ?? 0 } : students, { headers: { "Cache-Control": "no-store" } });
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
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const { nim, scores } = z.object({ nim: z.string().min(1).max(32),
      scores: z.array(z.object({ questionId: z.string().min(1), score: z.number().finite().min(0) })).min(1).max(200)
    }).parse(await readJsonBody(request, 50000));

    const [participant] = await db
      .select()
      .from(participants)
      .where(eq(participants.nim, nim));

    if (!participant) {
      return fail("Participant not found", 404);
    }

    const [session] = await db
      .select()
      .from(examSessions)
      .where(and(eq(examSessions.examId, examId), eq(examSessions.participantId, participant.id)));

    if (!session) {
      return fail("Session not found", 404);
    }

    const totalScore = await db.transaction(async (tx) => {
      const locked = await lockExamSession(tx, session.id);
      if (!["submitted", "auto_submitted"].includes(locked.status)) throw new HttpError("Penilaian hanya tersedia setelah sesi selesai.", 409);
      const now = new Date();
      const rows = await tx.select({ id: questions.id, score: questions.score }).from(questions)
        .where(and(eq(questions.examId, examId), inArray(questions.id, scores.map((item) => item.questionId))));
      const allowed = new Map(rows.map((row) => [row.id, row.score]));
      if (allowed.size !== scores.length) throw new HttpError("Soal duplikat atau tidak sesuai paket.", 422);
      const saved = await tx.insert(answers).values(scores.map((item) => ({ id: randomUUID(), sessionId: session.id,
        questionId: item.questionId, score: Math.min(allowed.get(item.questionId)!, item.score), gradedById: admin.id, gradedAt: now })))
        .onConflictDoUpdate({ target: [answers.sessionId, answers.questionId], set: {
          score: sql`excluded.score`, gradedById: admin.id, gradedAt: now, updatedAt: now
        } }).returning({ id: answers.id });
      await tx.delete(gradingJobs).where(inArray(gradingJobs.answerId, saved.map((row) => row.id)));
      const [total] = await tx.select({ score: sum(answers.score) }).from(answers).where(eq(answers.sessionId, session.id));
      const score = Number(total?.score ?? 0);
      await tx.update(examParticipants).set({ score, updatedAt: now })
        .where(and(eq(examParticipants.examId, examId), eq(examParticipants.participantId, participant.id)));
      return score;
    });

    return ok({ success: true, score: totalScore });
  } catch (error) {
    return handleError(error);
  }
}
