import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { fail, handleError, ok, requireAdmin } from "@/lib/api/http";
import { createParticipantSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const rows = await db.execute(sql`
      select distinct on (p.id)
        p.id,
        p.nim,
        p.name,
        p.prodi,
        p.class_name as "className",
        case ep.status
          when 'submitted' then 'Submit'
          when 'auto_submitted' then 'Auto Submit'
          when 'in_progress' then 'Mengerjakan'
          when 'registered' then 'Belum Mulai'
          else 'Belum Mulai'
        end as status,
        coalesce(ep.violations, 0)::int as violations,
        ep.score
      from participants p
      left join exam_participants ep on ep.participant_id = p.id
      order by p.id, ep.updated_at desc nulls last, p.created_at desc
    `);

    return ok(rows.rows);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const payload = createParticipantSchema.parse(await request.json());
    const now = new Date();
    const [participant] = await db
      .insert(participants)
      .values({
        id: randomUUID(),
        ...payload,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return ok(participant, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
