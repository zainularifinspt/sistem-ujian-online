ALTER TABLE "exams"
ADD COLUMN IF NOT EXISTS "enabled_violation_types" jsonb DEFAULT '["context-menu","copy","cut","paste","keyboard-shortcut","app-switch"]'::jsonb NOT NULL;
