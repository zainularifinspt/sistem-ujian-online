import { sql } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";

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
  questionOrder: number;
  questionPrompt: string;
  questionType: "essay" | "multiple_choice" | "short_answer";
  submittedAt: Date | string | null;
};

type GradingEssay = {
  answer: string;
  feedback: string;
  id: string;
  maxScore: number;
  question: string;
  rubric: string;
  score: number | null;
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
          submittedAt: formatSubmittedAt(row.submittedAt)
        } satisfies GradingStudent);

      if (row.questionType === "multiple_choice") {
        existing.mcMax += row.maxScore;
        existing.mcScore += row.answerScore ?? 0;
      }

      if (row.questionType === "short_answer") {
        existing.autoShortMax += row.maxScore;
        existing.autoShortScore += row.answerScore ?? 0;
      }

      if (row.questionType === "essay") {
        existing.essays.push({
          answer: row.answer ?? "Belum ada jawaban esai tersimpan.",
          feedback: "",
          id: row.questionId,
          maxScore: row.maxScore,
          question: row.questionPrompt,
          rubric: "Nilai berdasarkan ketepatan konsep, argumentasi, contoh, dan kejelasan.",
          score: row.answerScore
        });
      }

      students.set(row.nim, existing);
    }

    return ok(Array.from(students.values()));
  } catch (error) {
    return handleError(error);
  }
}
