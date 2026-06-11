import { randomUUID } from "node:crypto";

import { and, eq, sql, sum } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
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

type GradingRow = {
  answer: string | null;
  answerScore: number | null;
  className: string;
  maxScore: number;
  nim: string;
  participantName: string;
  prodi: string;
  questionId: string;
  questionImageUrl: string | null;
  questionOrder: number;
  questionPrompt: string;
  questionType: "essay" | "multiple_choice" | "short_answer";
  correctKey: string | null;
  questionOptions: { id: string; text: string }[] | null;
  submittedAt: Date | string | null;
};

type GradingEssay = {
  answer: string;
  feedback: string;
  id: string;
  imageUrl: string | null;
  maxScore: number;
  question: string;
  rubric: string;
  score: number | null;
};

type GradingAnswerDetail = {
  questionId: string;
  order: number;
  type: "multiple_choice" | "short_answer" | "essay";
  prompt: string;
  imageUrl: string | null;
  studentAnswer: string | null;
  correctKey: string | null;
  isCorrect: boolean;
  score: number | null;
  options: { id: string; text: string }[] | null;
};

type GradingStudent = {
  autoShortMax: number;
  autoShortScore: number;
  essays: GradingEssay[];
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

    const result = await db.execute<GradingRow>(sql`
      select
        p.nim,
        p.name as "participantName",
        p.prodi,
        p.class_name as "className",
        coalesce(ep.submitted_at, es.submitted_at) as "submittedAt",
        q.id as "questionId",
        q.question_order as "questionOrder",
        q.type as "questionType",
        q.prompt as "questionPrompt",
        q.image_url as "questionImageUrl",
        q.answer_key as "correctKey",
        q.options as "questionOptions",
        q.score as "maxScore",
        a.answer,
        a.score as "answerScore"
      from exam_participants ep
      join participants p on p.id = ep.participant_id
      join questions q on q.exam_id = ep.exam_id
      left join exam_sessions es
        on es.exam_id = ep.exam_id
       and es.participant_id = ep.participant_id
      left join answers a
        on a.session_id = es.id
       and a.question_id = q.id
      where ep.exam_id = ${examId}
      order by p.name asc, q.question_order asc
    `);

    const students = new Map<string, GradingStudent>();

    for (const row of result.rows) {
      const existing =
        students.get(row.nim) ??
        ({
          autoShortMax: 0,
          autoShortScore: 0,
          essays: [],
          kelas: row.className,
          mcMax: 0,
          mcScore: 0,
          name: row.participantName,
          nim: row.nim,
          prodi: row.prodi,
          submittedAt: formatSubmittedAt(row.submittedAt),
          answersDetail: []
        } satisfies GradingStudent);

      const isCorrect = (row.answerScore !== null && row.answerScore > 0);

      existing.answersDetail.push({
        questionId: row.questionId,
        order: row.questionOrder,
        type: row.questionType,
        prompt: row.questionPrompt,
        imageUrl: row.questionImageUrl,
        studentAnswer: row.answer,
        correctKey: row.correctKey,
        isCorrect,
        score: row.answerScore,
        options: row.questionOptions
      });

      if (row.questionType === "multiple_choice") {
        existing.mcMax += 1;
        existing.mcScore += isCorrect ? 1 : 0;
      }

      if (row.questionType === "short_answer") {
        existing.autoShortMax += 1;
        existing.autoShortScore += isCorrect ? 1 : 0;
      }

      if (row.questionType === "essay") {
        existing.essays.push({
          answer: row.answer ?? "Belum ada jawaban esai tersimpan.",
          feedback: "",
          id: row.questionId,
          imageUrl: row.questionImageUrl,
          maxScore: 1, // Remove score weights, default to 1
          question: row.questionPrompt,
          rubric: "Nilai berdasarkan ketepatan konsep, argumentasi, contoh, dan kejelasan.",
          score: (row.answerScore !== null && row.answerScore > 0) ? 1 : (row.answerScore === 0 ? 0 : null)
        });
      }

      students.set(row.nim, existing);
    }

    return ok(Array.from(students.values()));
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

      const finalScore = item.score !== null ? Number(item.score) : null;

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
