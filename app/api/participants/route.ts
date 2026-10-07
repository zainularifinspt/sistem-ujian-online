import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { fail, handleError, ok, requireAdmin } from "@/lib/api/http";
import { createParticipantSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const params = new URL(request.url).searchParams;
    const paginated = params.has("page");
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get("page")) || 1)));
    const pageSize = 25;
    const search = (params.get("search") ?? "").trim().slice(0, 100);
    const filter = search ? sql`where p.nim ilike ${`%${search}%`} or p.name ilike ${`%${search}%`} or p.prodi ilike ${`%${search}%`} or p.class_name ilike ${`%${search}%`}` : sql``;
    const [rows, count] = await Promise.all([
      db.execute(sql`
        select p.id, p.nim, p.name, p.prodi, p.class_name as "className",
          case ep.status when 'submitted' then 'Submit' when 'auto_submitted' then 'Auto Submit'
            when 'in_progress' then 'Mengerjakan' else 'Belum Mulai' end as status,
          coalesce(ep.violations, 0)::int as violations, ep.score
        from participants p
        left join lateral (
          select status, violations, score from exam_participants
          where participant_id = p.id order by updated_at desc, id limit 1
        ) ep on true
        ${filter}
        order by p.created_at desc, p.id
        ${paginated ? sql`limit ${pageSize} offset ${(page - 1) * pageSize}` : sql``}
      `),
      db.execute(sql`select count(*)::int as total from participants p ${filter}`)
    ]);
    return ok(paginated ? { items: rows.rows, total: Number(count.rows[0]?.total ?? 0), page, pageSize } : rows.rows);
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
