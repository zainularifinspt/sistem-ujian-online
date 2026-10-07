import { readJsonBody } from "@/lib/api/body";
import { scheduleGrading } from "@/lib/api/grading-worker";
import { closeExamSession } from "@/lib/api/grading";
import { fail, handleError, ok } from "@/lib/api/http";
import { answerBatchSchema } from "@/lib/api/validators";
import { hasSameOrigin, requireStudentSession } from "@/lib/api/student-session";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    if (!hasSameOrigin(request) || !await requireStudentSession(sessionId)) return fail("Akses sesi tidak valid.", 401);
    const batch = answerBatchSchema.parse(await readJsonBody(request));
    const result = await closeExamSession(sessionId, "submitted", { batch, requireComplete: true });
    scheduleGrading();
    return ok(result);
  } catch (error) { return handleError(error); }
}
