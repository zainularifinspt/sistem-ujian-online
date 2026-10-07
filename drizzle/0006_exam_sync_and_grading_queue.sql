CREATE TABLE "exam_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_jobs" (
	"answer_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"lease" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exams" ALTER COLUMN "violation_limit" SET DEFAULT 5;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "answer_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "writer_id" text;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "auth_nonce" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "token_rotated_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "enabled_violation_types" jsonb DEFAULT '["context-menu","copy","cut","paste","keyboard-shortcut","app-switch"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "image_url" text;--> statement-breakpoint
ALTER TABLE "exam_assets" ADD CONSTRAINT "exam_assets_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_jobs" ADD CONSTRAINT "grading_jobs_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grading_jobs_ready_idx" ON "grading_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "answers_question_id_idx" ON "answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exam_participants_status_idx" ON "exam_participants" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_status_idx" ON "exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_created_by_id_idx" ON "exams" USING btree ("created_by_id");