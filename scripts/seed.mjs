import nextEnv from "@next/env";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const { Pool } = pg;

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://sistem_ujian:sistem_ujian@localhost:55432/sistem_ujian";

const pool = new Pool({
  connectionString: databaseUrl
});

const now = new Date();
const password = await hashPassword("password123");

const users = [
  {
    id: "admin-zainul",
    name: "Admin Lokal",
    email: "admin@example.com",
    role: "admin"
  },
  {
    id: "dosen-zainul",
    name: "M Zainul Arifin, M.Pd.",
    email: "zainul@example.com",
    role: "dosen"
  },
  {
    id: "dosen-lina",
    name: "Dr. Lina Kurnia, M.Kom.",
    email: "lina@example.com",
    role: "dosen"
  }
];

const exams = [
  {
    id: "uas-basis-data",
    name: "UAS Basis Data",
    description: "Penilaian otomatis untuk PG/isian, manual untuk esai.",
    token: "BD-2026-A",
    durationMinutes: 120,
    startAt: new Date("2026-06-05T01:00:00.000Z"),
    endAt: new Date("2026-06-05T03:00:00.000Z"),
    status: "active",
    createdById: "dosen-zainul"
  },
  {
    id: "kuis-algoritma",
    name: "Kuis Algoritma",
    description: "Kuis singkat struktur data dan kompleksitas dasar.",
    token: "ALG-QUZ-7",
    durationMinutes: 45,
    startAt: new Date("2026-06-05T05:30:00.000Z"),
    endAt: new Date("2026-06-05T06:15:00.000Z"),
    status: "scheduled",
    createdById: "dosen-zainul"
  },
  {
    id: "uts-jaringan",
    name: "UTS Jaringan Komputer",
    description: "Evaluasi konsep routing, subnetting, dan protokol jaringan.",
    token: "NET-UTS-3",
    durationMinutes: 90,
    startAt: new Date("2026-06-02T00:00:00.000Z"),
    endAt: new Date("2026-06-02T01:30:00.000Z"),
    status: "finished",
    createdById: "dosen-lina"
  }
];

const participants = [
  {
    id: "participant-alya",
    nim: "23103001",
    name: "Alya Ramadhani",
    prodi: "Informatika",
    className: "IF-4A"
  },
  {
    id: "participant-raka",
    nim: "23103017",
    name: "Raka Pratama",
    prodi: "Informatika",
    className: "IF-4A"
  },
  {
    id: "participant-mei",
    nim: "23104021",
    name: "Mei Larasati",
    prodi: "Sistem Informasi",
    className: "SI-4B"
  },
  {
    id: "participant-dio",
    nim: "23105011",
    name: "Dio Mahendra",
    prodi: "Teknik Komputer",
    className: "TK-4C"
  }
];

const questions = [
  {
    id: "question-bd-1",
    examId: "uas-basis-data",
    order: 1,
    type: "multiple_choice",
    prompt: "Apa tujuan utama normalisasi basis data?",
    options: [
      { id: "a", text: "Mengurangi redundansi dan anomali data" },
      { id: "b", text: "Menghapus semua foreign key" },
      { id: "c", text: "Memperbanyak duplikasi data" },
      { id: "d", text: "Mengubah tabel menjadi file teks" }
    ],
    answerKey: "a",
    score: 2
  },
  {
    id: "question-bd-2",
    examId: "uas-basis-data",
    order: 2,
    type: "short_answer",
    prompt: "Sebutkan bentuk normal setelah 2NF.",
    options: null,
    answerKey: "3NF",
    score: 4
  },
  {
    id: "question-bd-3",
    examId: "uas-basis-data",
    order: 3,
    type: "essay",
    prompt: "Jelaskan normalisasi 3NF dan risiko anomali data.",
    options: null,
    answerKey: null,
    score: 40
  }
];

const examParticipants = [
  {
    id: "exam-participant-bd-alya",
    examId: "uas-basis-data",
    participantId: "participant-alya",
    status: "submitted",
    score: 88,
    violations: 0,
    startedAt: new Date("2026-06-05T01:01:00.000Z"),
    submittedAt: new Date("2026-06-05T02:42:00.000Z")
  },
  {
    id: "exam-participant-bd-raka",
    examId: "uas-basis-data",
    participantId: "participant-raka",
    status: "in_progress",
    score: null,
    violations: 2,
    startedAt: new Date("2026-06-05T01:04:00.000Z"),
    submittedAt: null
  },
  {
    id: "exam-participant-bd-dio",
    examId: "uas-basis-data",
    participantId: "participant-dio",
    status: "auto_submitted",
    score: 71,
    violations: 3,
    startedAt: new Date("2026-06-05T01:02:00.000Z"),
    submittedAt: new Date("2026-06-05T01:54:00.000Z")
  }
];

const sessions = [
  {
    id: "session-bd-alya",
    examId: "uas-basis-data",
    participantId: "participant-alya",
    status: "submitted",
    startedAt: new Date("2026-06-05T01:01:00.000Z"),
    expiresAt: new Date("2026-06-05T03:01:00.000Z"),
    submittedAt: new Date("2026-06-05T02:42:00.000Z")
  },
  {
    id: "session-bd-raka",
    examId: "uas-basis-data",
    participantId: "participant-raka",
    status: "in_progress",
    startedAt: new Date("2026-06-05T01:04:00.000Z"),
    expiresAt: new Date("2026-06-05T03:04:00.000Z"),
    submittedAt: null
  }
];

const answers = [
  {
    id: "answer-alya-bd-1",
    sessionId: "session-bd-alya",
    questionId: "question-bd-1",
    answer: "a",
    score: 2,
    gradedById: null,
    gradedAt: null
  },
  {
    id: "answer-alya-bd-2",
    sessionId: "session-bd-alya",
    questionId: "question-bd-2",
    answer: "3NF",
    score: 4,
    gradedById: null,
    gradedAt: null
  },
  {
    id: "answer-alya-bd-3",
    sessionId: "session-bd-alya",
    questionId: "question-bd-3",
    answer:
      "3NF memisahkan atribut non-kunci agar tidak bergantung transitif pada primary key. Dampaknya redundansi turun dan update anomaly bisa dicegah.",
    score: 34,
    gradedById: "dosen-zainul",
    gradedAt: new Date("2026-06-05T04:00:00.000Z")
  }
];

const violations = [
  {
    id: "violation-raka-copy",
    sessionId: "session-bd-raka",
    type: "copy",
    metadata: { source: "keyboard-shortcut", count: 1 }
  },
  {
    id: "violation-raka-tab",
    sessionId: "session-bd-raka",
    type: "tab_switch",
    metadata: { count: 1 }
  }
];

async function main() {
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const item of users) {
      await client.query(
        `
          insert into "user" (id, name, email, email_verified, image, role, created_at, updated_at)
          values ($1, $2, $3, true, null, $4, $5, $5)
          on conflict (id) do update set
            name = excluded.name,
            email = excluded.email,
            role = excluded.role,
            updated_at = excluded.updated_at
        `,
        [item.id, item.name, item.email, item.role, now]
      );

      await client.query(
        `
          insert into "account" (
            id,
            account_id,
            provider_id,
            user_id,
            password,
            created_at,
            updated_at
          )
          values ($1, $2, 'credential', $2, $3, $4, $4)
          on conflict (id) do update set
            password = excluded.password,
            updated_at = excluded.updated_at
        `,
        [`account-${item.id}`, item.id, password, now]
      );
    }

    for (const item of exams) {
      await client.query(
        `
          insert into exams (
            id,
            name,
            description,
            token,
            duration_minutes,
            start_at,
            end_at,
            shuffle_questions,
            shuffle_options,
            status,
            created_by_id,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, true, true, $8, $9, $10, $10)
          on conflict (id) do update set
            name = excluded.name,
            description = excluded.description,
            token = excluded.token,
            duration_minutes = excluded.duration_minutes,
            start_at = excluded.start_at,
            end_at = excluded.end_at,
            status = excluded.status,
            created_by_id = excluded.created_by_id,
            updated_at = excluded.updated_at
        `,
        [
          item.id,
          item.name,
          item.description,
          item.token,
          item.durationMinutes,
          item.startAt,
          item.endAt,
          item.status,
          item.createdById,
          now
        ]
      );
    }

    for (const item of participants) {
      await client.query(
        `
          insert into participants (id, nim, name, prodi, class_name, created_at, updated_at)
          values ($1, $2, $3, $4, $5, $6, $6)
          on conflict (id) do update set
            nim = excluded.nim,
            name = excluded.name,
            prodi = excluded.prodi,
            class_name = excluded.class_name,
            updated_at = excluded.updated_at
        `,
        [item.id, item.nim, item.name, item.prodi, item.className, now]
      );
    }

    for (const item of questions) {
      await client.query(
        `
          insert into questions (
            id,
            exam_id,
            question_order,
            type,
            prompt,
            options,
            answer_key,
            score,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          on conflict (id) do update set
            prompt = excluded.prompt,
            options = excluded.options,
            answer_key = excluded.answer_key,
            score = excluded.score,
            updated_at = excluded.updated_at
        `,
        [
          item.id,
          item.examId,
          item.order,
          item.type,
          item.prompt,
          item.options ? JSON.stringify(item.options) : null,
          item.answerKey,
          item.score,
          now
        ]
      );
    }

    for (const item of examParticipants) {
      await client.query(
        `
          insert into exam_participants (
            id,
            exam_id,
            participant_id,
            status,
            score,
            violations,
            started_at,
            submitted_at,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          on conflict (id) do update set
            status = excluded.status,
            score = excluded.score,
            violations = excluded.violations,
            started_at = excluded.started_at,
            submitted_at = excluded.submitted_at,
            updated_at = excluded.updated_at
        `,
        [
          item.id,
          item.examId,
          item.participantId,
          item.status,
          item.score,
          item.violations,
          item.startedAt,
          item.submittedAt,
          now
        ]
      );
    }

    for (const item of sessions) {
      await client.query(
        `
          insert into exam_sessions (
            id,
            exam_id,
            participant_id,
            status,
            started_at,
            expires_at,
            submitted_at,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          on conflict (id) do update set
            status = excluded.status,
            started_at = excluded.started_at,
            expires_at = excluded.expires_at,
            submitted_at = excluded.submitted_at,
            updated_at = excluded.updated_at
        `,
        [
          item.id,
          item.examId,
          item.participantId,
          item.status,
          item.startedAt,
          item.expiresAt,
          item.submittedAt,
          now
        ]
      );
    }

    for (const item of answers) {
      await client.query(
        `
          insert into answers (
            id,
            session_id,
            question_id,
            answer,
            score,
            graded_by_id,
            graded_at,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          on conflict (id) do update set
            answer = excluded.answer,
            score = excluded.score,
            graded_by_id = excluded.graded_by_id,
            graded_at = excluded.graded_at,
            updated_at = excluded.updated_at
        `,
        [
          item.id,
          item.sessionId,
          item.questionId,
          item.answer,
          item.score,
          item.gradedById,
          item.gradedAt,
          now
        ]
      );
    }

    for (const item of violations) {
      await client.query(
        `
          insert into violations (id, session_id, type, metadata, created_at)
          values ($1, $2, $3, $4, $5)
          on conflict (id) do update set
            type = excluded.type,
            metadata = excluded.metadata,
            created_at = excluded.created_at
        `,
        [
          item.id,
          item.sessionId,
          item.type,
          JSON.stringify(item.metadata),
          now
        ]
      );
    }

    await client.query("commit");
    console.log("Seed complete.");
    console.log("Login users:");
    console.log("- admin@example.com / password123");
    console.log("- zainul@example.com / password123");
    console.log("- lina@example.com / password123");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
