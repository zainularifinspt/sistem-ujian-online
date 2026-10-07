import { fail, handleError, ok, requireAdmin, requireExamAccess } from "@/lib/api/http";
import { runGradingJobs } from "@/lib/api/grading-worker";
import { hasSameOrigin } from "@/lib/api/student-session";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin || !hasSameOrigin(request)) return fail("Unauthorized", 401);
    const { examId } = await context.params;
    const access = await requireExamAccess(admin, examId);
    if (access.error) return access.error;
    return ok({ processed: await runGradingJobs(examId) });
  } catch (error) { return handleError(error); }
}
