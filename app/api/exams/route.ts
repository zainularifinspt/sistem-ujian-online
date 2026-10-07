import { randomUUID } from "node:crypto";

import { and, eq, lte, sql } from "drizzle-orm";

import {
  createUniqueExamToken,
  refreshActiveExamTokens
} from "@/lib/api/exam-token";
import { fail, getUserRole, handleError, ok, requireAdmin } from "@/lib/api/http";
import { createExamSchema } from "@/lib/api/validators";
import { db } from "@/lib/db";
import { exams } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return fail("Unauthorized", 401);
    }

    const isAdmin = getUserRole(admin) === "admin";
    const now = new Date();

    // Automatically transition expired exams to finished and refresh active tokens in parallel
    await Promise.all([
      db
        .update(exams)
        .set({ status: "finished", updatedAt: now })
        .where(and(eq(exams.status, "active"), lte(exams.endAt, now))),
      refreshActiveExamTokens()
    ]);
    const rows = await db.execute(sql`
      select
        e.id,
        e.name,
        e.description,
        e.token,
        e.token_rotated_at as "tokenRotatedAt",
        e.duration_minutes as "durationMinutes",
        e.violation_limit as "violationLimit",
        e.enabled_violation_types as "enabledViolationTypes",
        e.start_at as "startAt",
        e.end_at as "endAt",
        e.shuffle_questions as "shuffleQuestions",
        e.shuffle_options as "shuffleOptions",
        e.status,
        e.created_by_id as "createdById",
        e.created_at as "createdAt",
        e.updated_at as "updatedAt",
        u.name as "createdByName",
        coalesce(roster_counts.participants, 0)::int as participants,
        coalesce(roster_counts.submitted, 0)::int as submitted,
        coalesce(roster_counts.logged_in, 0)::int as "loggedIn",
        coalesce(question_counts.total, 0)::int as questions,
        coalesce(question_counts.mc, 0)::int as "multipleChoice",
        coalesce(question_counts.short, 0)::int as "shortAnswer",
        coalesce(question_counts.essay, 0)::int as essay,
        coalesce((
          select count(distinct ep_sub.id)::int
          from exam_participants ep_sub
          join questions q_sub on q_sub.exam_id = e.id
          left join exam_sessions es_sub 
            on es_sub.exam_id = e.id 
           and es_sub.participant_id = ep_sub.participant_id
          left join answers a_sub 
            on a_sub.session_id = es_sub.id 
           and a_sub.question_id = q_sub.id
          where ep_sub.exam_id = e.id
            and ep_sub.status in ('submitted', 'auto_submitted')
            and q_sub.type = 'essay'
            and a_sub.score is null
        ), 0) as "needsGrading"
      from exams e
      left join "user" u on u.id = e.created_by_id
      left join lateral (
        select count(*) as participants,
          count(*) filter (where ep.status in ('submitted', 'auto_submitted')) as submitted,
          count(*) filter (where ep.status = 'in_progress') as logged_in
        from exam_participants ep where ep.exam_id = e.id
      ) roster_counts on true
      left join lateral (
        select count(*) as total,
          count(*) filter (where q.type = 'multiple_choice') as mc,
          count(*) filter (where q.type = 'short_answer') as short,
          count(*) filter (where q.type = 'essay') as essay
        from questions q where q.exam_id = e.id
      ) question_counts on true
      where ${isAdmin ? sql`true` : sql`e.created_by_id = ${admin.id}`}
      order by e.created_at desc
    `);

    return ok(
      rows.rows.map((row) => ({
        ...row,
        questionMix: {
          essay: row.essay,
          multipleChoice: row.multipleChoice,
          shortAnswer: row.shortAnswer
        }
      }))
    );
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

    const payload = createExamSchema.parse(await request.json());
    const now = new Date();
    const token = payload.token ?? (await createUniqueExamToken());
    const [exam] = await db
      .insert(exams)
      .values({
        id: randomUUID(),
        ...payload,
        token,
        tokenRotatedAt: now,
        createdById: admin.id,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    return ok(exam, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
