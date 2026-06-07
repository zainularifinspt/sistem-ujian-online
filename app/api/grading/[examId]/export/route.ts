import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import {
  fail,
  handleError,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

type ExportQuestionRow = {
  id: string;
  type: "essay" | "multiple_choice" | "short_answer";
};

type ExportRosterRow = {
  nim: string;
  participantId: string;
  participantName: string;
  startedAt: Date | string | null;
  submittedAt: Date | string | null;
};

type ExportAnswerRow = {
  answer: string | null;
  answerScore: number | null;
  participantId: string;
  questionId: string;
  questionType: "essay" | "multiple_choice" | "short_answer";
};

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("id-ID", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Makassar",
    year: "numeric"
  });
}

function sanitizeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
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

    const [questionsResult, rosterResult, answersResult] = await Promise.all([
      db.execute<ExportQuestionRow>(sql`
        select
          id,
          type
        from questions
        where exam_id = ${examId}
        order by question_order asc
      `),
      db.execute<ExportRosterRow>(sql`
        select
          p.id as "participantId",
          p.nim,
          p.name as "participantName",
          coalesce(ep.started_at, es.started_at) as "startedAt",
          coalesce(ep.submitted_at, es.submitted_at) as "submittedAt"
        from exam_participants ep
        join participants p on p.id = ep.participant_id
        left join exam_sessions es
          on es.exam_id = ep.exam_id
         and es.participant_id = ep.participant_id
        where ep.exam_id = ${examId}
        order by p.name asc, p.nim asc
      `),
      db.execute<ExportAnswerRow>(sql`
        select
          es.participant_id as "participantId",
          q.id as "questionId",
          q.type as "questionType",
          a.answer,
          a.score as "answerScore"
        from exam_sessions es
        join answers a on a.session_id = es.id
        join questions q on q.id = a.question_id
        where es.exam_id = ${examId}
      `)
    ]);

    const essayQuestions = questionsResult.rows.filter(
      (question) => question.type === "essay"
    );
    const answersByParticipant = new Map<string, ExportAnswerRow[]>();

    for (const answer of answersResult.rows) {
      answersByParticipant.set(answer.participantId, [
        ...(answersByParticipant.get(answer.participantId) ?? []),
        answer
      ]);
    }

    const header = [
      "Waktu Mulai",
      "Waktu Selesai",
      "NIM",
      "NAMA",
      ...essayQuestions.map(
        (_question, index) => `Jawaban Essai Pertanyaan ${index + 1}`
      ),
      "Benar Pilihan Ganda",
      "Benar Isian Singkat",
      "Benar Essai",
      "Total Benar"
    ];
    const body = rosterResult.rows.map((participant) => {
      const participantAnswers =
        answersByParticipant.get(participant.participantId) ?? [];
      const essayAnswers = new Map(
        participantAnswers
          .filter((answer) => answer.questionType === "essay")
          .map((answer) => [answer.questionId, answer.answer ?? ""])
      );
      const mcCorrect = participantAnswers
        .filter((answer) => answer.questionType === "multiple_choice" && answer.answerScore !== null && answer.answerScore > 0)
        .length;
      const shortCorrect = participantAnswers
        .filter((answer) => answer.questionType === "short_answer" && answer.answerScore !== null && answer.answerScore > 0)
        .length;
      const essayCorrect = participantAnswers
        .filter((answer) => answer.questionType === "essay" && answer.answerScore !== null && answer.answerScore > 0)
        .length;

      return [
        formatDateTime(participant.startedAt),
        formatDateTime(participant.submittedAt),
        participant.nim,
        participant.participantName,
        ...essayQuestions.map((question) => essayAnswers.get(question.id) ?? ""),
        mcCorrect,
        shortCorrect,
        essayCorrect,
        mcCorrect + shortCorrect + essayCorrect
      ];
    });
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
    const workbook = XLSX.utils.book_new();

    worksheet["!cols"] = header.map((heading) => ({
      wch: heading.startsWith("Jawaban Essai")
        ? 42
        : Math.max(14, heading.length + 2)
    }));

    XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ujian");

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer"
    }) as Buffer;
    const filename = `hasil-ujian-${
      sanitizeFilename(access.exam?.name ?? "paket") || "paket"
    }.xlsx`;
    const bodyBlob = new Blob([new Uint8Array(buffer)]);

    return new NextResponse(bodyBlob, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    });
  } catch (error) {
    return handleError(error);
  }
}
