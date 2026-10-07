import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { examParticipants, exams, violations } from "@/lib/db/schema";
import { closeExamSession } from "@/lib/api/grading";
import { lockExamSession } from "@/lib/api/answer-batch";
import { scheduleGrading } from "@/lib/api/grading-worker";
import { fail, handleError, HttpError, ok } from "@/lib/api/http";
import { violationSchema } from "@/lib/api/validators";
import { isViolationEnabled } from "@/lib/api/violations";
import { hasSameOrigin, requireStudentSession } from "@/lib/api/student-session";
import { readJsonBody } from "@/lib/api/body";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    if (!hasSameOrigin(request) || !await requireStudentSession(sessionId)) return fail("Akses sesi tidak valid.", 401);
    const payload = violationSchema.parse(await readJsonBody(request, 16000));
    const result = await db.transaction(async (tx) => {
      const session = await lockExamSession(tx, sessionId);
      if (session.status !== "in_progress") throw new HttpError("Sesi sedang dijeda atau sudah ditutup.", 409);
      const [exam] = await tx.select().from(exams).where(eq(exams.id, session.examId));
      const ignored = !isViolationEnabled(exam.enabledViolationTypes, payload.type);
      if (!ignored) await tx.insert(violations).values({ id: randomUUID(), sessionId, type: payload.type, metadata: payload.metadata });
      const [counter] = await tx.select({ value: count() }).from(violations).where(eq(violations.sessionId, sessionId));
      if (!ignored) await tx.update(examParticipants).set({ violations: counter.value, updatedAt: new Date() })
        .where(and(eq(examParticipants.examId, session.examId), eq(examParticipants.participantId, session.participantId)));
      return { ignored, totalViolations: counter.value, violationLimit: exam.violationLimit,
        autoSubmitted: !ignored && counter.value >= exam.violationLimit };
    });
    if (result.autoSubmitted) { await closeExamSession(sessionId, "auto_submitted"); scheduleGrading(); }
    return ok(result);
  } catch (error) { return handleError(error); }
}
