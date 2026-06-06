import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";

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

    const now = new Date();
    let [participant] = payload.participantId
      ? await db
          .select()
          .from(participants)
          .where(eq(participants.id, payload.participantId))
      : await db
          .select()
          .from(participants)
          .where(eq(participants.nim, payload.nim!));

    if (!participant) {
      if (!payload.nim || !payload.name) {
        return fail("Participant not found", 404);
      }

      [participant] = await db
        .insert(participants)
        .values({
          className: payload.className ?? "-",
          createdAt: now,
          id: randomUUID(),
          name: payload.name,
          nim: payload.nim,
          prodi: payload.prodi ?? "-",
          updatedAt: now
        })
        .returning();
    } else if (payload.name || payload.prodi || payload.className) {
      [participant] = await db
        .update(participants)
        .set({
          className: payload.className ?? participant.className,
          name: payload.name ?? participant.name,
          prodi: payload.prodi ?? participant.prodi,
          updatedAt: now
        })
        .where(eq(participants.id, participant.id))
        .returning();
    }

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

    const [total] = await db
      .select({ value: count() })
      .from(examParticipants)
      .where(eq(examParticipants.examId, examId));

    return ok(
      { ...registration, participant, totalParticipants: total.value },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
