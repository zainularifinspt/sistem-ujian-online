import { randomUUID } from "node:crypto";

import { and, eq, lte, or, sql, sum } from "drizzle-orm";

import {
  fail,
  handleError,
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
  questions
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

    // 1. Auto-close any expired or overdue sessions safely if present
    const overdueSessions = await db
      .select({ id: examSessions.id })
      .from(examSessions)
      .where(
        and(
          eq(examSessions.examId, examId),
          or(
            eq(examSessions.status, "expired"),
            and(
              eq(examSessions.status, "in_progress"),
              lte(examSessions.expiresAt, new Date())
            )
          )
        )
      )
      .limit(1);

    if (overdueSessions.length > 0) {
      await db.execute(sql`
        UPDATE exam_sessions
        SET status = 'auto_submitted',
            submitted_at = coalesce(submitted_at, expires_at, now()),
            updated_at = now()
        WHERE exam_id = ${examId}
          AND (status = 'expired' OR (status = 'in_progress' AND expires_at <= now()))
      `);

      await db.execute(sql`
        UPDATE exam_participants ep
        SET status = 'auto_submitted',
            submitted_at = coalesce(ep.submitted_at, now()),
            updated_at = now()
        FROM exam_sessions es
        WHERE es.exam_id = ${examId}
          AND es.participant_id = ep.participant_id
          AND ep.exam_id = ${examId}
          AND ep.status = 'in_progress'
          AND es.status = 'auto_submitted'
      `);
    }

    // 2. Run questions, participants, and answers queries concurrently
    const [questionsRows, participantRows, answerRows] = await Promise.all([
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
        where ep.exam_id = ${examId}
        order by p.name asc
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
      `)
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

    return ok(students);
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

    const { nim, scores } = (await request.json()) as {
      nim: string;
      scores: { questionId: string; score: number | null }[];
    };

    if (!nim || !Array.isArray(scores)) {
      return fail("Invalid payload", 400);
    }

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

    const now = new Date();

    for (const item of scores) {
      const [question] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, item.questionId), eq(questions.examId, examId)));

      if (!question) {
        continue;
      }

      const finalScore =
        item.score !== null && !isNaN(Number(item.score))
          ? Math.max(0, Math.min(question.score, Number(item.score)))
          : null;

      await db
        .insert(answers)
        .values({
          id: randomUUID(),
          sessionId: session.id,
          questionId: item.questionId,
          score: finalScore,
          gradedById: admin.id,
          gradedAt: now,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [answers.sessionId, answers.questionId],
          set: {
            score: finalScore,
            gradedById: admin.id,
            gradedAt: now,
            updatedAt: now
          }
        });
    }

    const [scoreResult] = await db
      .select({ total: sum(answers.score) })
      .from(answers)
      .where(eq(answers.sessionId, session.id));

    const totalScore = Number(scoreResult.total ?? 0);

    await db
      .update(examParticipants)
      .set({
        score: totalScore,
        updatedAt: now
      })
      .where(
        and(
          eq(examParticipants.examId, examId),
          eq(examParticipants.participantId, participant.id)
        )
      );

    return ok({ success: true, score: totalScore });
  } catch (error) {
    return handleError(error);
  }
}
