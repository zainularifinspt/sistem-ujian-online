import { and, eq, sum } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  answers,
  examParticipants,
  examSessions,
  questions
} from "@/lib/db/schema";

function normalizeAnswer(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export async function closeExamSession(
  sessionId: string,
  status: "submitted" | "auto_submitted"
) {
  const [session] = await db
    .select()
    .from(examSessions)
    .where(eq(examSessions.id, sessionId));

  if (!session) {
    return null;
  }

  const rows = await db
    .select({
      answerId: answers.id,
      answer: answers.answer,
      questionId: questions.id,
      type: questions.type,
      answerKey: questions.answerKey,
      score: questions.score
    })
    .from(questions)
    .leftJoin(
      answers,
      and(eq(answers.questionId, questions.id), eq(answers.sessionId, sessionId))
    )
    .where(eq(questions.examId, session.examId));

  const now = new Date();

  for (const row of rows) {
    if (!row.answerId || row.type === "essay") {
      continue;
    }

    const earned =
      normalizeAnswer(row.answer) === normalizeAnswer(row.answerKey) ? row.score : 0;

    await db
      .update(answers)
      .set({
        score: earned,
        updatedAt: now
      })
      .where(eq(answers.id, row.answerId));
  }

  const [scoreResult] = await db
    .select({ total: sum(answers.score) })
    .from(answers)
    .where(eq(answers.sessionId, sessionId));

  const score = Number(scoreResult.total ?? 0);

  await db
    .update(examSessions)
    .set({
      status,
      submittedAt: now,
      updatedAt: now
    })
    .where(eq(examSessions.id, sessionId));

  await db
    .update(examParticipants)
    .set({
      status,
      score,
      submittedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(examParticipants.examId, session.examId),
        eq(examParticipants.participantId, session.participantId)
      )
    );

  return {
    sessionId,
    status,
    score
  };
}
