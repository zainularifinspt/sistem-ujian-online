import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { registerParticipantSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { examParticipants, participants } from "@/lib/db/schema";

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
    const payload = registerParticipantSchema.parse(await request.json());
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const [participant] = payload.participantId
      ? await db
          .select()
          .from(participants)
          .where(eq(participants.id, payload.participantId))
      : await db.select().from(participants).where(eq(participants.nim, payload.nim!));

    if (!participant) {
      return fail("Participant not found", 404);
    }

    const now = new Date();
    const [registration] = await db
      .insert(examParticipants)
      .values({
        id: randomUUID(),
        examId,
        participantId: participant.id,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [examParticipants.examId, examParticipants.participantId],
        set: {
          status: "registered",
          updatedAt: now
        }
      })
      .returning();

    return ok({ ...registration, participant }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
