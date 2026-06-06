import { and, count, eq, ne } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { updateExamParticipantSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { examParticipants, participants } from "@/lib/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string; registrationId: string }>;
};

async function getRegistration(examId: string, registrationId: string) {
  const [row] = await db
    .select({
      participant: participants,
      registration: examParticipants
    })
    .from(examParticipants)
    .innerJoin(participants, eq(examParticipants.participantId, participants.id))
    .where(
      and(
        eq(examParticipants.examId, examId),
        eq(examParticipants.id, registrationId)
      )
    );

  return row;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId, registrationId } = await context.params;
    const payload = updateExamParticipantSchema.parse(await request.json());
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const row = await getRegistration(examId, registrationId);

    if (!row) {
      return fail("Participant registration not found", 404);
    }

    const [existingNim] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(eq(participants.nim, payload.nim), ne(participants.id, row.participant.id))
      );

    if (existingNim) {
      return fail("NIM sudah digunakan peserta lain", 409);
    }

    const [participant] = await db
      .update(participants)
      .set({
        name: payload.name,
        nim: payload.nim,
        updatedAt: new Date()
      })
      .where(eq(participants.id, row.participant.id))
      .returning();

    return ok({
      ...row.registration,
      participant
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId, registrationId } = await context.params;
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const [registration] = await db
      .delete(examParticipants)
      .where(
        and(
          eq(examParticipants.examId, examId),
          eq(examParticipants.id, registrationId)
        )
      )
      .returning();

    if (!registration) {
      return fail("Participant registration not found", 404);
    }

    const [total] = await db
      .select({ value: count() })
      .from(examParticipants)
      .where(eq(examParticipants.examId, examId));

    return ok({
      deleted: true,
      id: registration.id,
      totalParticipants: total.value
    });
  } catch (error) {
    return handleError(error);
  }
}
