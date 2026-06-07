import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exams } from "@/lib/db/schema";

type AuthUser = {
  id: string;
  role?: string | null;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("Invalid request payload", 422, error.issues);
  }

  if (error instanceof Error) {
    return fail(error.message, 500);
  }

  return fail("Unexpected server error", 500);
}

export async function requireAdmin() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session?.user) {
    return null;
  }

  return session.user as AuthUser;
}

export function getUserRole(user: AuthUser) {
  return user.role === "dosen" ? "dosen" : "admin";
}

export function canAccessOwner(user: AuthUser, ownerId?: string | null) {
  return getUserRole(user) === "admin" || ownerId === user.id;
}

export async function requireExamAccess(user: AuthUser, examId: string) {
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId));

  if (!exam) {
    return { error: fail("Exam not found", 404), exam: null };
  }

  if (!canAccessOwner(user, exam.createdById)) {
    return { error: fail("Forbidden", 403), exam: null };
  }

  return { error: null, exam };
}
