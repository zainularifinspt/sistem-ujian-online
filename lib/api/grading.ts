import { and, eq, sum } from "drizzle-orm";

import { evaluateShortAnswerWithAI } from "@/lib/api/ai-grading";

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
  status: "submitted" | "auto_submitted",
  options?: { skipAi?: boolean }
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
      score: questions.score,
      prompt: questions.prompt
    })
    .from(questions)
    .leftJoin(
      answers,
      and(eq(answers.questionId, questions.id), eq(answers.sessionId, sessionId))
    )
    .where(eq(questions.examId, session.examId));

  const now = new Date();
  const submittedAt =
    session.submittedAt ??
    (session.expiresAt && session.expiresAt < now ? session.expiresAt : now);

  const updates = await Promise.all(
    rows.map(async (row) => {
      if (!row.answerId || row.type === "essay") {
        return null;
      }

      let earned = 0;
      if (row.type === "short_answer" && row.answer && row.answerKey) {
        if (options?.skipAi) {
          earned =
            normalizeAnswer(row.answer) === normalizeAnswer(row.answerKey)
              ? row.score
              : 0;
        } else {
          const isCorrect = await evaluateShortAnswerWithAI(
            row.prompt,
            row.answerKey,
            row.answer
          );
          earned = isCorrect ? row.score : 0;
        }
      } else {
        earned =
          normalizeAnswer(row.answer) === normalizeAnswer(row.answerKey)
            ? row.score
            : 0;
      }

      return { answerId: row.answerId, earned };
    })
  );

  const validUpdates = updates.filter(
    (u): u is { answerId: string; earned: number } => u !== null
  );

  if (validUpdates.length > 0) {
    await Promise.all(
      validUpdates.map((update) =>
        db
          .update(answers)
          .set({
            score: update.earned,
            updatedAt: now
          })
          .where(eq(answers.id, update.answerId))
      )
    );
  }

  const [scoreResult] = await db
    .select({ total: sum(answers.score) })
    .from(answers)
    .where(eq(answers.sessionId, sessionId));

  const score = Number(scoreResult?.total ?? 0);

  await Promise.all([
    db
      .update(examSessions)
      .set({
        status,
        submittedAt,
        updatedAt: now
      })
      .where(eq(examSessions.id, sessionId)),
    db
      .update(examParticipants)
      .set({
        status,
        score,
        submittedAt,
        updatedAt: now
      })
      .where(
        and(
          eq(examParticipants.examId, session.examId),
          eq(examParticipants.participantId, session.participantId)
        )
      )
  ]);

  return {
    sessionId,
    status,
    score
  };
}
