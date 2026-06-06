import "server-only";

import { randomInt } from "node:crypto";

import { and, eq, lte, ne } from "drizzle-orm";

import { db } from "@/lib/db";
import { exams } from "@/lib/db/schema";

export const EXAM_TOKEN_REFRESH_MS = 10 * 60 * 1000;

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TOKEN_LENGTH = 4;
const VALID_EXAM_TOKEN = /^[A-Z]{4}$/;

export function createExamToken() {
  return Array.from({ length: TOKEN_LENGTH }, () =>
    TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)]
  ).join("");
}

export function isValidExamToken(token: string) {
  return VALID_EXAM_TOKEN.test(token);
}

export async function createUniqueExamToken(excludedExamId?: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const token = createExamToken();
    const [existing] = await db
      .select({ id: exams.id })
      .from(exams)
      .where(
        excludedExamId
          ? and(eq(exams.token, token), ne(exams.id, excludedExamId))
          : eq(exams.token, token)
      );

    if (!existing) {
      return token;
    }
  }

  throw new Error("Token ujian unik belum bisa dibuat.");
}

export function getNextTokenRefreshAt(tokenRotatedAt: Date | string) {
  return new Date(new Date(tokenRotatedAt).getTime() + EXAM_TOKEN_REFRESH_MS);
}

export async function refreshExamTokenIfNeeded(exam: typeof exams.$inferSelect) {
  if (exam.status !== "active" && isValidExamToken(exam.token)) {
    return exam;
  }

  const now = new Date();

  if (isValidExamToken(exam.token) && now < getNextTokenRefreshAt(exam.tokenRotatedAt)) {
    return exam;
  }

  const token = await createUniqueExamToken(exam.id);
  const [updatedExam] = await db
    .update(exams)
    .set({
      token,
      tokenRotatedAt: now,
      updatedAt: now
    })
    .where(
      and(
        eq(exams.id, exam.id),
        isValidExamToken(exam.token)
          ? lte(
              exams.tokenRotatedAt,
              new Date(now.getTime() - EXAM_TOKEN_REFRESH_MS)
            )
          : eq(exams.token, exam.token)
      )
    )
    .returning();

  return updatedExam ?? exam;
}

export async function refreshActiveExamTokens() {
  const activeExams = await db
    .select()
    .from(exams)
    .where(eq(exams.status, "active"));

  return Promise.all(activeExams.map((exam) => refreshExamTokenIfNeeded(exam)));
}

export async function refreshDisplayExamTokens() {
  const rows = await db.select().from(exams);

  return Promise.all(rows.map((exam) => refreshExamTokenIfNeeded(exam)));
}
