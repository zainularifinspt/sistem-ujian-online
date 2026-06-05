import { count, eq, sql } from "drizzle-orm";

import { fail, getUserRole, handleError, ok, requireAdmin } from "@/lib/api/http";
import { db } from "@/lib/db";
import {
  exams,
  participants,
  violations
} from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const isAdmin = getUserRole(admin) === "admin";
    const [totalExams] = isAdmin
      ? await db.select({ value: count() }).from(exams)
      : await db
          .select({ value: count() })
          .from(exams)
          .where(eq(exams.createdById, admin.id));
    const [activeExams] = isAdmin
      ? await db
          .select({ value: count() })
          .from(exams)
          .where(eq(exams.status, "active"))
      : await db
          .select({ value: count() })
          .from(exams)
          .where(
            sql`${exams.status} = 'active' and ${exams.createdById} = ${admin.id}`
          );
    const [totalParticipants] = await db
      .select({ value: count() })
      .from(participants);
    const [totalViolations] = await db.select({ value: count() }).from(violations);

    const scoreRows = await db.execute<{ range: string; total: number }>(sql`
      select
        case
          when ep.score < 50 then '0-49'
          when ep.score < 65 then '50-64'
          when ep.score < 80 then '65-79'
          else '80-100'
        end as range,
        count(*)::int as total
      from exam_participants ep
      join exams e on e.id = ep.exam_id
      where ep.score is not null
        and ${isAdmin ? sql`true` : sql`e.created_by_id = ${admin.id}`}
      group by 1
    `);
    const scoreSummaryRows = await db.execute<{
      average: number | null;
      highest: number | null;
      lowest: number | null;
      median: number | null;
    }>(sql`
      select
        round(avg(ep.score))::int as average,
        max(ep.score)::int as highest,
        min(ep.score)::int as lowest,
        percentile_cont(0.5) within group (order by ep.score)::int as median
      from exam_participants ep
      join exams e on e.id = ep.exam_id
      where ep.score is not null
        and ${isAdmin ? sql`true` : sql`e.created_by_id = ${admin.id}`}
    `);
    const liveRows = await db.execute<{
      answered: number;
      loginAt: Date | string;
      name: string;
      nim: string;
      progress: number;
      questionCount: number;
      remainingSeconds: number;
      status: string;
    }>(sql`
      select
        p.name,
        p.nim,
        ep.status,
        ep.started_at as "loginAt",
        greatest(0, extract(epoch from (es.expires_at - now())))::int as "remainingSeconds",
        count(distinct a.id)::int as answered,
        count(distinct q.id)::int as "questionCount",
        case
          when count(distinct q.id) = 0 then 0
          else round((count(distinct a.id)::numeric / count(distinct q.id)::numeric) * 100)::int
        end as progress
      from exam_participants ep
      join exams e on e.id = ep.exam_id
      join participants p on p.id = ep.participant_id
      join exam_sessions es
        on es.exam_id = ep.exam_id
       and es.participant_id = ep.participant_id
      left join questions q on q.exam_id = e.id
      left join answers a
        on a.session_id = es.id
       and a.question_id = q.id
      where ep.status = 'in_progress'
        and ${isAdmin ? sql`true` : sql`e.created_by_id = ${admin.id}`}
      group by p.name, p.nim, ep.status, ep.started_at, es.expires_at
      order by ep.started_at desc
      limit 10
    `);
    const scoreTotal = scoreRows.rows.reduce((total, row) => total + row.total, 0);
    const bandColors: Record<string, string> = {
      "0-49": "bg-rose-500",
      "50-64": "bg-amber-500",
      "65-79": "bg-sky-500",
      "80-100": "bg-emerald-500"
    };
    const bands = ["0-49", "50-64", "65-79", "80-100"].map((range) => {
      const row = scoreRows.rows.find((item) => item.range === range);

      return {
        color: bandColors[range],
        range,
        value: scoreTotal ? Math.round(((row?.total ?? 0) / scoreTotal) * 100) : 0
      };
    });
    const summary = scoreSummaryRows.rows[0];

    return ok({
      totalExams: totalExams.value,
      activeExams: activeExams.value,
      totalParticipants: totalParticipants.value,
      totalViolations: totalViolations.value,
      scoreBands: bands,
      scoreSummary: {
        average: summary?.average ?? 0,
        highest: summary?.highest ?? 0,
        lowest: summary?.lowest ?? 0,
        median: summary?.median ?? 0
      },
      liveSessions: liveRows.rows.map((row) => {
        const hours = Math.floor(row.remainingSeconds / 3600);
        const minutes = Math.floor((row.remainingSeconds % 3600) / 60);
        const seconds = row.remainingSeconds % 60;

        return {
          answered: `${row.answered}/${row.questionCount}`,
          loginAt: new Date(row.loginAt).toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Makassar"
          }),
          name: row.name,
          nim: row.nim,
          progress: row.progress,
          remaining: [hours, minutes, seconds]
            .map((item) => String(item).padStart(2, "0"))
            .join(":"),
          status: row.status === "in_progress" ? "Mengerjakan" : row.status
        };
      })
    });
  } catch (error) {
    return handleError(error);
  }
}
