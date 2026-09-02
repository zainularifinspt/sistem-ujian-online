import { and, eq, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { closeExamSession } from "@/lib/api/grading";
import {
  fail,
  handleError,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

type QuestionOption = {
  id: string;
  text: string;
  imageUrl?: string | null;
};

type ExportQuestionRow = {
  id: string;
  order: number;
  type: "essay" | "multiple_choice" | "short_answer";
  prompt: string;
  options: QuestionOption[] | null;
  answerKey: string | null;
  score: number;
};

type ExportRosterRow = {
  className: string | null;
  nim: string;
  participantId: string;
  participantName: string;
  prodi: string | null;
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

function getFormattedAnswerAndKey(
  question: ExportQuestionRow,
  rawAnswer: string | null | undefined
) {
  if (question.type === "multiple_choice") {
    const opts = Array.isArray(question.options) ? question.options : [];
    const optMap = new Map(
      opts.map((opt, idx) => [
        opt.id,
        { letter: String.fromCharCode(65 + idx), text: opt.text, index: idx }
      ])
    );

    const keyOpt = question.answerKey ? optMap.get(question.answerKey) : undefined;
    const formattedKey = keyOpt
      ? `${keyOpt.letter}. ${keyOpt.text || `(Pilihan ${keyOpt.letter})`}`
      : question.answerKey ?? "-";

    const studentOpt = rawAnswer ? optMap.get(rawAnswer) : undefined;
    const formattedAnswer = studentOpt
      ? `${studentOpt.letter}. ${studentOpt.text || `(Pilihan ${studentOpt.letter})`}`
      : rawAnswer?.trim()
        ? rawAnswer
        : "(Kosong)";

    return {
      formattedKey,
      formattedAnswer,
      studentLetter: studentOpt?.letter ?? "-",
      keyLetter: keyOpt?.letter ?? "-"
    };
  }

  if (question.type === "short_answer") {
    return {
      formattedKey: question.answerKey?.trim() ?? "-",
      formattedAnswer: rawAnswer?.trim() ?? "(Kosong)",
      studentLetter: "-",
      keyLetter: "-"
    };
  }

  // Essay
  return {
    formattedKey: "Esai (Koreksi Manual)",
    formattedAnswer: rawAnswer?.trim() ?? "(Kosong)",
    studentLetter: "-",
    keyLetter: "-"
  };
}

function buildQuestionStatisticsSheet(
  questions: ExportQuestionRow[],
  roster: ExportRosterRow[],
  answersByParticipant: Map<string, Map<string, ExportAnswerRow>>
) {
  const totalParticipants = roster.length;

  const headers = [
    "No Soal",
    "Tipe Soal",
    "Pertanyaan",
    "Kunci Jawaban",
    "Bobot Soal",
    "Total Peserta",
    "Jumlah Benar",
    "Jumlah Salah",
    "Tidak Menjawab",
    "Belum Dinilai",
    "% Benar",
    "% Salah",
    "% Kosong",
    "Rata-rata Skor",
    "Pilihan A",
    "Pilihan B",
    "Pilihan C",
    "Pilihan D",
    "Pilihan E",
    "Tingkat Kesukaran"
  ];

  let sumMaxScore = 0;
  let sumCorrect = 0;
  let sumIncorrect = 0;
  let sumBlank = 0;
  let sumUngraded = 0;
  let sumAvgScore = 0;

  const rows = questions.map((q) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    const optMap = new Map(
      opts.map((opt, idx) => [
        opt.id,
        { letter: String.fromCharCode(65 + idx), text: opt.text, index: idx }
      ])
    );

    const { formattedKey } = getFormattedAnswerAndKey(q, null);
    const typeName =
      q.type === "multiple_choice"
        ? "Pilihan Ganda"
        : q.type === "short_answer"
          ? "Isian Singkat"
          : "Esai";

    let correctCount = 0;
    let incorrectCount = 0;
    let blankCount = 0;
    let ungradedCount = 0;
    let totalScoreEarned = 0;

    const mcChoiceCounts: Record<string, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0
    };

    for (const student of roster) {
      const studentAnswers = answersByParticipant.get(student.participantId);
      const ans = studentAnswers?.get(q.id);
      const rawAnswer = ans?.answer?.trim();
      const hasAnswer = Boolean(rawAnswer && rawAnswer.length > 0);
      const earnedScore = ans?.answerScore ?? 0;

      if (q.type === "multiple_choice") {
        if (!hasAnswer) {
          blankCount++;
        } else {
          const studentOpt = optMap.get(rawAnswer!);
          let letter = studentOpt?.letter;
          if (!letter && rawAnswer!.length === 1 && /^[A-E]$/i.test(rawAnswer!)) {
            letter = rawAnswer!.toUpperCase();
          }

          if (letter && letter in mcChoiceCounts) {
            mcChoiceCounts[letter]++;
          }

          if (earnedScore > 0) {
            correctCount++;
          } else {
            incorrectCount++;
          }
        }

        if (ans?.answerScore !== null && ans?.answerScore !== undefined) {
          totalScoreEarned += earnedScore;
        }
      } else if (q.type === "short_answer") {
        if (!hasAnswer) {
          blankCount++;
        } else {
          if (earnedScore > 0) {
            correctCount++;
          } else {
            incorrectCount++;
          }
        }

        if (ans?.answerScore !== null && ans?.answerScore !== undefined) {
          totalScoreEarned += earnedScore;
        }
      } else {
        // essay
        if (!hasAnswer) {
          blankCount++;
        } else if (ans?.answerScore === null || ans?.answerScore === undefined) {
          ungradedCount++;
        } else {
          if (earnedScore > 0) {
            correctCount++;
          } else {
            incorrectCount++;
          }
          totalScoreEarned += earnedScore;
        }
      }
    }

    const pctCorrectNum = totalParticipants > 0 ? (correctCount / totalParticipants) * 100 : 0;
    const pctIncorrectNum = totalParticipants > 0 ? (incorrectCount / totalParticipants) * 100 : 0;
    const pctBlankNum = totalParticipants > 0 ? (blankCount / totalParticipants) * 100 : 0;
    const avgScoreNum = totalParticipants > 0 ? totalScoreEarned / totalParticipants : 0;

    let difficulty = "-";
    if (totalParticipants > 0) {
      if (pctCorrectNum >= 70) {
        difficulty = "Mudah";
      } else if (pctCorrectNum >= 30) {
        difficulty = "Sedang";
      } else {
        difficulty = "Sukar";
      }
    }

    sumMaxScore += q.score;
    sumCorrect += correctCount;
    sumIncorrect += incorrectCount;
    sumBlank += blankCount;
    sumUngraded += ungradedCount;
    sumAvgScore += avgScoreNum;

    return [
      q.order,
      typeName,
      q.prompt.replace(/\s+/g, " ").trim(),
      formattedKey,
      q.score,
      totalParticipants,
      correctCount,
      incorrectCount,
      blankCount,
      ungradedCount,
      `${pctCorrectNum.toFixed(1)}%`,
      `${pctIncorrectNum.toFixed(1)}%`,
      `${pctBlankNum.toFixed(1)}%`,
      Number(avgScoreNum.toFixed(2)),
      q.type === "multiple_choice" ? mcChoiceCounts.A : "-",
      q.type === "multiple_choice" ? mcChoiceCounts.B : "-",
      q.type === "multiple_choice" ? mcChoiceCounts.C : "-",
      q.type === "multiple_choice" ? mcChoiceCounts.D : "-",
      q.type === "multiple_choice" ? mcChoiceCounts.E : "-",
      difficulty
    ];
  });

  const totalQuestions = questions.length;
  const avgPctCorrect =
    totalParticipants > 0 && totalQuestions > 0
      ? ((sumCorrect / (totalParticipants * totalQuestions)) * 100).toFixed(1) + "%"
      : "0%";
  const avgPctIncorrect =
    totalParticipants > 0 && totalQuestions > 0
      ? ((sumIncorrect / (totalParticipants * totalQuestions)) * 100).toFixed(1) + "%"
      : "0%";
  const avgPctBlank =
    totalParticipants > 0 && totalQuestions > 0
      ? ((sumBlank / (totalParticipants * totalQuestions)) * 100).toFixed(1) + "%"
      : "0%";

  const summaryRow = [
    "TOTAL / RATA-RATA",
    `${totalQuestions} Butir Soal`,
    "-",
    "-",
    sumMaxScore,
    totalParticipants,
    sumCorrect,
    sumIncorrect,
    sumBlank,
    sumUngraded,
    avgPctCorrect,
    avgPctIncorrect,
    avgPctBlank,
    Number(sumAvgScore.toFixed(2)),
    "-",
    "-",
    "-",
    "-",
    "-",
    "-"
  ];

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows, summaryRow]);
  sheet["!cols"] = [
    { wch: 10 },
    { wch: 16 },
    { wch: 50 },
    { wch: 32 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 }
  ];

  return sheet;
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

    const { searchParams } = new URL(request.url);
    const exportType = searchParams.get("type") ?? searchParams.get("mode") ?? "summary";

    // Auto-close any expired or overdue sessions before generating export
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
      );

    for (const s of overdueSessions) {
      await closeExamSession(s.id, "auto_submitted");
    }

    const [questionsResult, rosterResult, answersResult] = await Promise.all([
      db.execute<ExportQuestionRow>(sql`
        select
          id,
          question_order as "order",
          type,
          prompt,
          options,
          answer_key as "answerKey",
          score
        from questions
        where exam_id = ${examId}
        order by question_order asc
      `),
      db.execute<ExportRosterRow>(sql`
        select
          p.id as "participantId",
          p.nim,
          p.name as "participantName",
          p.class_name as "className",
          p.prodi,
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

    const questions = questionsResult.rows;
    const roster = rosterResult.rows;
    const answersByParticipant = new Map<string, Map<string, ExportAnswerRow>>();

    for (const answer of answersResult.rows) {
      if (!answersByParticipant.has(answer.participantId)) {
        answersByParticipant.set(answer.participantId, new Map());
      }
      answersByParticipant.get(answer.participantId)!.set(answer.questionId, answer);
    }

    const workbook = XLSX.utils.book_new();

    if (exportType === "raw") {
      // ==========================================
      // SHEET 1: Matriks Jawaban Siswa & Kunci
      // ==========================================
      const matrixHeaders: string[] = [
        "No",
        "NIM",
        "Nama Mahasiswa",
        "Kelas",
        "Prodi",
        "Waktu Mulai",
        "Waktu Selesai",
        "Total Nilai",
        "Skor PG",
        "Skor Isian",
        "Skor Esai",
        "Total Benar"
      ];

      for (const q of questions) {
        const typeLabel =
          q.type === "multiple_choice"
            ? "PG"
            : q.type === "short_answer"
              ? "Isian"
              : "Esai";
        matrixHeaders.push(`No ${q.order} [${typeLabel}] - Jawaban Peserta`);
        matrixHeaders.push(`No ${q.order} - Kunci Jawaban`);
        matrixHeaders.push(`No ${q.order} - Skor`);
        matrixHeaders.push(`No ${q.order} - Status`);
      }

      const matrixRows: (string | number)[][] = [];

      roster.forEach((student, sIdx) => {
        const studentAnswers = answersByParticipant.get(student.participantId) ?? new Map();

        let mcScore = 0;
        let shortScore = 0;
        let essayScore = 0;
        let totalCorrect = 0;

        const questionCols: (string | number)[] = [];

        for (const q of questions) {
          const ans = studentAnswers.get(q.id);
          const { formattedAnswer, formattedKey } = getFormattedAnswerAndKey(
            q,
            ans?.answer
          );

          const earnedScore = ans?.answerScore ?? 0;
          const isCorrect = earnedScore > 0;

          if (q.type === "multiple_choice") {
            mcScore += earnedScore;
            if (isCorrect) totalCorrect++;
          } else if (q.type === "short_answer") {
            shortScore += earnedScore;
            if (isCorrect) totalCorrect++;
          } else if (q.type === "essay") {
            essayScore += earnedScore;
            if (isCorrect) totalCorrect++;
          }

          const statusText =
            q.type === "essay"
              ? ans?.answerScore !== null
                ? `Skor ${ans?.answerScore}`
                : "Belum Dinilai"
              : isCorrect
                ? "Benar"
                : ans?.answer
                  ? "Salah"
                  : "Kosong";

          questionCols.push(formattedAnswer);
          questionCols.push(formattedKey);
          questionCols.push(ans?.answerScore !== null ? earnedScore : "-");
          questionCols.push(statusText);
        }

        const totalScore = mcScore + shortScore + essayScore;

        matrixRows.push([
          sIdx + 1,
          student.nim,
          student.participantName,
          student.className ?? "-",
          student.prodi ?? "-",
          formatDateTime(student.startedAt),
          formatDateTime(student.submittedAt),
          totalScore,
          mcScore,
          shortScore,
          essayScore,
          totalCorrect,
          ...questionCols
        ]);
      });

      const matrixSheet = XLSX.utils.aoa_to_sheet([matrixHeaders, ...matrixRows]);
      matrixSheet["!cols"] = matrixHeaders.map((h) => ({
        wch: h.includes("Jawaban") || h.includes("Kunci") ? 32 : Math.max(12, h.length + 2)
      }));
      XLSX.utils.book_append_sheet(workbook, matrixSheet, "Matriks Jawaban & Kunci");

      // ==========================================
      // SHEET 2: Detail Jawaban Per Butir Soal
      // ==========================================
      const detailHeaders = [
        "No",
        "NIM",
        "Nama Mahasiswa",
        "Kelas",
        "Prodi",
        "No Soal",
        "Tipe Soal",
        "Pertanyaan",
        "Kunci Jawaban Resmi",
        "Jawaban Peserta",
        "Status",
        "Skor Diperoleh",
        "Bobot Maksimal"
      ];

      const detailRows: (string | number)[][] = [];
      let itemCounter = 1;

      roster.forEach((student) => {
        const studentAnswers = answersByParticipant.get(student.participantId) ?? new Map();

        for (const q of questions) {
          const ans = studentAnswers.get(q.id);
          const { formattedAnswer, formattedKey } = getFormattedAnswerAndKey(
            q,
            ans?.answer
          );

          const earnedScore = ans?.answerScore ?? 0;
          const isCorrect = earnedScore > 0;
          const statusText =
            q.type === "essay"
              ? ans?.answerScore !== null
                ? `Skor ${ans?.answerScore}`
                : "Belum Dinilai"
              : isCorrect
                ? "Benar"
                : ans?.answer
                  ? "Salah"
                  : "Kosong";

          const typeName =
            q.type === "multiple_choice"
              ? "Pilihan Ganda"
              : q.type === "short_answer"
                ? "Isian Singkat"
                : "Esai";

          detailRows.push([
            itemCounter++,
            student.nim,
            student.participantName,
            student.className ?? "-",
            student.prodi ?? "-",
            q.order,
            typeName,
            q.prompt.replace(/\s+/g, " ").trim(),
            formattedKey,
            formattedAnswer,
            statusText,
            ans?.answerScore !== null ? earnedScore : 0,
            q.score
          ]);
        }
      });

      const detailSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
      detailSheet["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 28 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 45 },
        { wch: 32 },
        { wch: 32 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 }
      ];
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Detail Per Butir Soal");

      // ==========================================
      // SHEET 3: Daftar Kunci Jawaban Master
      // ==========================================
      const masterHeaders = [
        "Nomor Soal",
        "Tipe Soal",
        "Pertanyaan / Prompt",
        "Pilihan A",
        "Pilihan B",
        "Pilihan C",
        "Pilihan D",
        "Pilihan E",
        "Kunci Jawaban Resmi",
        "Bobot Nilai"
      ];

      const masterRows = questions.map((q) => {
        const opts = Array.isArray(q.options) ? q.options : [];
        const { formattedKey } = getFormattedAnswerAndKey(q, null);
        const typeName =
          q.type === "multiple_choice"
            ? "Pilihan Ganda"
            : q.type === "short_answer"
              ? "Isian Singkat"
              : "Esai";

        return [
          q.order,
          typeName,
          q.prompt,
          opts[0]?.text ?? "-",
          opts[1]?.text ?? "-",
          opts[2]?.text ?? "-",
          opts[3]?.text ?? "-",
          opts[4]?.text ?? "-",
          formattedKey,
          q.score
        ];
      });

      const masterSheet = XLSX.utils.aoa_to_sheet([masterHeaders, ...masterRows]);
      masterSheet["!cols"] = [
        { wch: 12 },
        { wch: 16 },
        { wch: 45 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
        { wch: 30 },
        { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(workbook, masterSheet, "Kunci Jawaban Master");

      const statsSheet = buildQuestionStatisticsSheet(questions, roster, answersByParticipant);
      XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistik Per Soal");
    } else {
      // ==========================================
      // SUMMARY EXPORT (Standard format)
      // ==========================================
      const essayQuestions = questions.filter((question) => question.type === "essay");

      const header = [
        "Waktu Mulai",
        "Waktu Selesai",
        "NIM",
        "NAMA",
        ...essayQuestions.map(
          (_question, index) => `Jawaban Essai Pertanyaan ${index + 1}`
        ),
        "Skor PG",
        "Skor Isian",
        "Skor Essai",
        "Total Nilai",
        "Benar PG",
        "Benar Isian",
        "Benar Essai",
        "Total Benar"
      ];

      const body = roster.map((participant) => {
        const participantAnswers = answersByParticipant.get(participant.participantId) ?? new Map();
        const answersList = Array.from(participantAnswers.values());

        const essayAnswers = new Map(
          answersList
            .filter((answer) => answer.questionType === "essay")
            .map((answer) => [answer.questionId, answer.answer ?? ""])
        );
        const mcScore = answersList
          .filter((answer) => answer.questionType === "multiple_choice")
          .reduce((sum, answer) => sum + (answer.answerScore ?? 0), 0);
        const shortScore = answersList
          .filter((answer) => answer.questionType === "short_answer")
          .reduce((sum, answer) => sum + (answer.answerScore ?? 0), 0);
        const essayScore = answersList
          .filter((answer) => answer.questionType === "essay")
          .reduce((sum, answer) => sum + (answer.answerScore ?? 0), 0);
        const totalScore = mcScore + shortScore + essayScore;

        const mcCorrect = answersList.filter(
          (answer) =>
            answer.questionType === "multiple_choice" &&
            answer.answerScore !== null &&
            answer.answerScore > 0
        ).length;
        const shortCorrect = answersList.filter(
          (answer) =>
            answer.questionType === "short_answer" &&
            answer.answerScore !== null &&
            answer.answerScore > 0
        ).length;
        const essayCorrect = answersList.filter(
          (answer) =>
            answer.questionType === "essay" &&
            answer.answerScore !== null &&
            answer.answerScore > 0
        ).length;

        return [
          formatDateTime(participant.startedAt),
          formatDateTime(participant.submittedAt),
          participant.nim,
          participant.participantName,
          ...essayQuestions.map((question) => essayAnswers.get(question.id) ?? ""),
          mcScore,
          shortScore,
          essayScore,
          totalScore,
          mcCorrect,
          shortCorrect,
          essayCorrect,
          mcCorrect + shortCorrect + essayCorrect
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
      worksheet["!cols"] = header.map((heading) => ({
        wch: heading.startsWith("Jawaban Essai")
          ? 42
          : Math.max(14, heading.length + 2)
      }));

      XLSX.utils.book_append_sheet(workbook, worksheet, "Hasil Ujian");

      const statsSheet = buildQuestionStatisticsSheet(questions, roster, answersByParticipant);
      XLSX.utils.book_append_sheet(workbook, statsSheet, "Statistik Per Soal");
    }

    const buffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer"
    }) as Buffer;

    const prefix = exportType === "raw" ? "jawaban-mentah-dan-kunci" : "hasil-ujian";
    const filename = `${prefix}-${
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
