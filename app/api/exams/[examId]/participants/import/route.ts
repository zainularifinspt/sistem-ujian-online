import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { importExamParticipantsSchema } from "@/lib/api/validators";
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
    const payload = importExamParticipantsSchema.parse(await request.json());
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const now = new Date();
    let createdParticipants = 0;
    let registeredParticipants = 0;

    for (const item of payload.participants) {
      const participantId = randomUUID();
      const [participant] = await db
        .insert(participants)
        .values({
          className: "-",
          createdAt: now,
          id: participantId,
          name: item.name,
          nim: item.nim,
          prodi: "-",
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: participants.nim,
          set: {
            name: item.name,
            updatedAt: now
          }
        })
        .returning();

      if (participant.id === participantId) {
        createdParticipants += 1;
      }

      const [registration] = await db
        .insert(examParticipants)
        .values({
          createdAt: now,
          examId,
          id: randomUUID(),
          participantId: participant.id,
          updatedAt: now
        })
        .onConflictDoNothing({
          target: [examParticipants.examId, examParticipants.participantId]
        })
        .returning();

      if (registration) {
        registeredParticipants += 1;
      }
    }

    const [total] = await db
      .select({ value: count() })
      .from(examParticipants)
      .where(eq(examParticipants.examId, examId));

    return ok(
      {
        createdParticipants,
        importedRows: payload.participants.length,
        registeredParticipants,
        totalParticipants: total.value
      },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
