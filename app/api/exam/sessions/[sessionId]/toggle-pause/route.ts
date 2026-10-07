import { eq } from "drizzle-orm";
import { fail, handleError, HttpError, ok, requireAdmin, requireExamAccess } from "@/lib/api/http";
import { db } from "@/lib/db";
import { examSessions } from "@/lib/db/schema";
import { lockExamSession } from "@/lib/api/answer-batch";
import { hasSameOrigin } from "@/lib/api/student-session";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const admin = await requireAdmin();
    if (!admin || !hasSameOrigin(request)) return fail("Unauthorized", 401);
    const { sessionId } = await context.params;
    const [found] = await db.select({ examId: examSessions.examId }).from(examSessions).where(eq(examSessions.id, sessionId));
    if (!found) return fail("Sesi tidak ditemukan.", 404);
    const access = await requireExamAccess(admin, found.examId);
    if (access.error) return access.error;
    const result = await db.transaction(async (tx) => {
      const session = await lockExamSession(tx, sessionId), now = new Date();
      if (session.status === "in_progress") {
        if (session.expiresAt <= now) throw new HttpError("Waktu ujian sudah habis.", 409);
        await tx.update(examSessions).set({ status: "paused", pausedAt: now, updatedAt: now }).where(eq(examSessions.id, sessionId));
        return { status: "paused" };
      }
      if (session.status === "paused") {
        const expiresAt = new Date(session.expiresAt.getTime() + now.getTime() - (session.pausedAt?.getTime() ?? now.getTime()));
        await tx.update(examSessions).set({ status: "in_progress", expiresAt, pausedAt: null, updatedAt: now }).where(eq(examSessions.id, sessionId));
        return { status: "in_progress", expiresAt: expiresAt.toISOString() };
      }
      throw new HttpError("Sesi sudah ditutup.", 409);
    });
    return ok(result);
  } catch (error) { return handleError(error); }
}
