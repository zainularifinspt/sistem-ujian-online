import { readJsonBody } from "@/lib/api/body";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { examParticipants, examSessions, exams, loginAttempts, participants } from "@/lib/db/schema";
import { fail, handleError, HttpError, ok } from "@/lib/api/http";
import { startExamSchema } from "@/lib/api/validators";
import { hasSameOrigin, setStudentCookie } from "@/lib/api/student-session";
import { getStudentPayload } from "@/lib/api/student-payload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!hasSameOrigin(request)) return fail("Akses tidak valid.", 403);
    const { nim, token } = startExamSchema.parse(await readJsonBody(request));
    const now = new Date();
    const key = createHash("sha256").update(nim.trim()).digest("hex");
    const [limit] = await db.insert(loginAttempts).values({ key, expiresAt: new Date(now.getTime() + 60000) })
      .onConflictDoUpdate({ target: loginAttempts.key, set: {
        attempts: sql`case when ${loginAttempts.expiresAt} <= now() then 1 else ${loginAttempts.attempts} + 1 end`,
        expiresAt: sql`case when ${loginAttempts.expiresAt} <= now() then now() + interval '1 minute' else ${loginAttempts.expiresAt} end`
      } }).returning();
    if (limit.attempts > 10) return fail("Terlalu banyak percobaan. Coba lagi dalam satu menit.", 429);
    // Token rotation is handled by admin/maintenance, not a scan on every login.
    const [exam] = await db.select().from(exams).where(eq(exams.token, token));
    if (!exam) return fail("Token ujian tidak valid.", 404);
    const [participant] = await db.select().from(participants).where(eq(participants.nim, nim.trim()));
    if (!participant) return fail("NIM belum terdaftar.", 404);
    const session = await db.transaction(async (tx) => {
      // Existing sessions and submission take locks in the same order.
      let [existing] = await tx.select().from(examSessions).where(and(eq(examSessions.examId, exam.id),
        eq(examSessions.participantId, participant.id))).for("update");
      const [registration] = await tx.select().from(examParticipants).where(and(eq(examParticipants.examId, exam.id),
        eq(examParticipants.participantId, participant.id))).for("update");
      if (!registration) throw new HttpError("Peserta tidak terdaftar pada ujian ini.", 403);
      if (["submitted", "auto_submitted"].includes(registration.status)) throw new HttpError("Peserta sudah submit ujian.", 409);
      if (!existing) [existing] = await tx.select().from(examSessions).where(and(eq(examSessions.examId, exam.id),
        eq(examSessions.participantId, participant.id))).for("update");
      if (existing) {
        if (!["in_progress", "paused"].includes(existing.status)) throw new HttpError("Sesi sudah ditutup.", 409);
        const [updated] = await tx.update(examSessions).set({ writerId: randomUUID() }).where(eq(examSessions.id, existing.id)).returning();
        return updated;
      }
      if (exam.status !== "active" || now < exam.startAt || now >= exam.endAt) throw new HttpError("Ujian belum aktif atau di luar jadwal.", 403);
      const [created] = await tx.insert(examSessions).values({ id: randomUUID(), examId: exam.id, participantId: participant.id,
        startedAt: now, expiresAt: exam.endAt, authNonce: randomUUID(), writerId: randomUUID() }).returning();
      await tx.update(examParticipants).set({ status: "in_progress", startedAt: now, updatedAt: now }).where(eq(examParticipants.id, registration.id));
      return created;
    });
    const response = ok(await getStudentPayload(session), { headers: { "Cache-Control": "no-store" } });
    setStudentCookie(response, session);
    return response;
  } catch (error) { return handleError(error); }
}
