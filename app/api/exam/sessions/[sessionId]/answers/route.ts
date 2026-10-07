import { readJsonBody } from "@/lib/api/body";
import { db } from "@/lib/db";
import { fail, handleError, ok } from "@/lib/api/http";
import { answerBatchSchema } from "@/lib/api/validators";
import { hasSameOrigin, requireStudentSession } from "@/lib/api/student-session";
import { lockExamSession, saveAnswerBatch } from "@/lib/api/answer-batch";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    if (!hasSameOrigin(request) || !await requireStudentSession(sessionId)) return fail("Akses sesi tidak valid.", 401);
    if (Number(request.headers.get("content-length")) > 2_000_000) return fail("Jawaban terlalu besar.", 413);
    const batch = answerBatchSchema.parse(await readJsonBody(request));
    const revision = await db.transaction(async (tx) => saveAnswerBatch(tx, await lockExamSession(tx, sessionId), batch));
    return ok({ revision });
  } catch (error) { return handleError(error); }
}
