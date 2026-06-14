import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  timestamp,
  text,
  uniqueIndex
} from "drizzle-orm/pg-core";

import type { ViolationType } from "@/lib/api/violations";
import { DEFAULT_ENABLED_VIOLATIONS } from "@/lib/api/violations";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
};

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("admin"),
  ...timestamps
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId)
  })
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId)
  })
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps
});

export const exams = pgTable("exams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  token: text("token").notNull().unique(),
  tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  durationMinutes: integer("duration_minutes").notNull(),
  violationLimit: integer("violation_limit").notNull().default(5),
  enabledViolationTypes: jsonb("enabled_violation_types")
    .$type<ViolationType[]>()
    .notNull()
    .default(DEFAULT_ENABLED_VIOLATIONS),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
  shuffleOptions: boolean("shuffle_options").notNull().default(true),
  status: text("status", {
    enum: ["draft", "scheduled", "active", "finished"]
  })
    .notNull()
    .default("draft"),
  createdById: text("created_by_id").references(() => user.id, {
    onDelete: "set null"
  }),
  ...timestamps
});

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),
  nim: text("nim").notNull().unique(),
  name: text("name").notNull(),
  prodi: text("prodi").notNull(),
  className: text("class_name").notNull(),
  ...timestamps
});

export const examParticipants = pgTable(
  "exam_participants",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["registered", "in_progress", "submitted", "auto_submitted", "reset"]
    })
      .notNull()
      .default("registered"),
    score: real("score"),
    violations: integer("violations").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    examParticipantUnique: uniqueIndex("exam_participant_unique").on(
      table.examId,
      table.participantId
    ),
    examIdIdx: index("exam_participants_exam_id_idx").on(table.examId),
    participantIdIdx: index("exam_participants_participant_id_idx").on(
      table.participantId
    )
  })
);

export const questions = pgTable(
  "questions",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    order: integer("question_order").notNull(),
    type: text("type", {
      enum: ["multiple_choice", "short_answer", "essay"]
    }).notNull(),
    prompt: text("prompt").notNull(),
    imageUrl: text("image_url"),
    options: jsonb("options").$type<
      { id: string; text: string }[] | null
    >(),
    answerKey: text("answer_key"),
    score: real("score").notNull().default(1),
    ...timestamps
  },
  (table) => ({
    examIdIdx: index("questions_exam_id_idx").on(table.examId),
    orderUnique: uniqueIndex("questions_exam_order_unique").on(
      table.examId,
      table.order
    )
  })
);

export const examSessions = pgTable(
  "exam_sessions",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["in_progress", "submitted", "auto_submitted", "expired"]
    })
      .notNull()
      .default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    examParticipantUnique: uniqueIndex("exam_sessions_exam_participant_unique").on(
      table.examId,
      table.participantId
    ),
    examIdIdx: index("exam_sessions_exam_id_idx").on(table.examId),
    participantIdIdx: index("exam_sessions_participant_id_idx").on(
      table.participantId
    )
  })
);

export const answers = pgTable(
  "answers",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    answer: text("answer"),
    score: real("score"),
    gradedById: text("graded_by_id").references(() => user.id, {
      onDelete: "set null"
    }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => ({
    sessionQuestionUnique: uniqueIndex("answers_session_question_unique").on(
      table.sessionId,
      table.questionId
    ),
    sessionIdIdx: index("answers_session_id_idx").on(table.sessionId)
  })
);

export const violations = pgTable(
  "violations",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => examSessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date())
  },
  (table) => ({
    sessionIdIdx: index("violations_session_id_idx").on(table.sessionId)
  })
);

export const examRelations = relations(exams, ({ many, one }) => ({
  questions: many(questions),
  roster: many(examParticipants),
  sessions: many(examSessions),
  createdBy: one(user, {
    fields: [exams.createdById],
    references: [user.id]
  })
}));

export const participantRelations = relations(participants, ({ many }) => ({
  exams: many(examParticipants),
  sessions: many(examSessions)
}));

export const examParticipantRelations = relations(examParticipants, ({ one }) => ({
  exam: one(exams, {
    fields: [examParticipants.examId],
    references: [exams.id]
  }),
  participant: one(participants, {
    fields: [examParticipants.participantId],
    references: [participants.id]
  })
}));

export const questionRelations = relations(questions, ({ one, many }) => ({
  exam: one(exams, {
    fields: [questions.examId],
    references: [exams.id]
  }),
  answers: many(answers)
}));

export const examSessionRelations = relations(examSessions, ({ one, many }) => ({
  exam: one(exams, {
    fields: [examSessions.examId],
    references: [exams.id]
  }),
  participant: one(participants, {
    fields: [examSessions.participantId],
    references: [participants.id]
  }),
  answers: many(answers),
  violations: many(violations)
}));

export const answerRelations = relations(answers, ({ one }) => ({
  session: one(examSessions, {
    fields: [answers.sessionId],
    references: [examSessions.id]
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id]
  }),
  gradedBy: one(user, {
    fields: [answers.gradedById],
    references: [user.id]
  })
}));

export const violationRelations = relations(violations, ({ one }) => ({
  session: one(examSessions, {
    fields: [violations.sessionId],
    references: [examSessions.id]
  })
}));

export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type Question = typeof questions.$inferSelect;
