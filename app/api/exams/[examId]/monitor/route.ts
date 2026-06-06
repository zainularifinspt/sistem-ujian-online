import { sql } from "drizzle-orm";

import {
  fail,
  handleError,
  ok,
  requireAdmin,
  requireExamAccess
} from "@/lib/api/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ examId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const { examId } = await context.params;
    const access = await requireExamAccess(admin, examId);

    if (access.error) {
      return access.error;
    }

    const rows = await db.execute(sql`
      select
        ep.id as "registrationId",
        ep.status as "registrationStatus",
        ep.score,
        ep.violations,
        ep.started_at as "registeredStartedAt",
        ep.submitted_at as "registeredSubmittedAt",
        p.id as "participantId",
        p.nim,
        p.name,
        p.prodi,
        p.class_name as "className",
        s.id as "sessionId",
        s.status as "sessionStatus",
        s.started_at as "sessionStartedAt",
        s.expires_at as "sessionExpiresAt",
        s.submitted_at as "sessionSubmittedAt",
        coalesce(answer_counts.answered, 0)::int as "answeredCount",
        coalesce(question_counts.total, 0)::int as "questionCount"
      from exam_participants ep
      inner join participants p on p.id = ep.participant_id
      left join exam_sessions s on s.exam_id = ep.exam_id
        and s.participant_id = ep.participant_id
      left join lateral (
        select count(*)::int as answered
        from answers a
        where a.session_id = s.id
          and nullif(trim(coalesce(a.answer, '')), '') is not null
      ) answer_counts on true
      left join lateral (
        select count(*)::int as total
        from questions q
        where q.exam_id = ep.exam_id
      ) question_counts on true
      where ep.exam_id = ${examId}
      order by p.name asc
    `);

    return ok(rows.rows);
  } catch (error) {
    return handleError(error);
  }
}
