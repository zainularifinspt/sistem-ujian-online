CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"question_id" text NOT NULL,
	"answer" text,
	"score" real,
	"graded_by_id" text,
	"graded_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"score" real,
	"violations" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"token" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"shuffle_questions" boolean DEFAULT true NOT NULL,
	"shuffle_options" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exams_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"nim" text NOT NULL,
	"name" text NOT NULL,
	"prodi" text NOT NULL,
	"class_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "participants_nim_unique" UNIQUE("nim")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"exam_id" text NOT NULL,
	"question_order" integer NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"answer_key" text,
	"score" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_graded_by_id_user_id_fk" FOREIGN KEY ("graded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_participants" ADD CONSTRAINT "exam_participants_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_session_question_unique" ON "answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "answers_session_id_idx" ON "answers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_participant_unique" ON "exam_participants" USING btree ("exam_id","participant_id");--> statement-breakpoint
CREATE INDEX "exam_participants_exam_id_idx" ON "exam_participants" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exam_participants_participant_id_idx" ON "exam_participants" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_sessions_exam_participant_unique" ON "exam_sessions" USING btree ("exam_id","participant_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_exam_id_idx" ON "exam_sessions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_participant_id_idx" ON "exam_sessions" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "questions_exam_id_idx" ON "questions" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_exam_order_unique" ON "questions" USING btree ("exam_id","question_order");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "violations_session_id_idx" ON "violations" USING btree ("session_id");