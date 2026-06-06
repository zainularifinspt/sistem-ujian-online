ALTER TABLE "exams" ADD COLUMN "token_rotated_at" timestamp with time zone DEFAULT now() NOT NULL;
