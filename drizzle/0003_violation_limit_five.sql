ALTER TABLE "exams" ALTER COLUMN "violation_limit" SET DEFAULT 5;
UPDATE "exams" SET "violation_limit" = 5 WHERE "violation_limit" = 3;
