import { randomUUID } from "node:crypto";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { createQuestionSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { questions } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
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

    const payload = createQuestionSchema.parse(await request.json());
    const now = new Date();
    const [question] = await db
      .insert(questions)
      .values({
        id: randomUUID(),
        examId,
        ...payload,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return ok(question, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
