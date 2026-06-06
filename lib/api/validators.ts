import { z } from "zod";

const dateString = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid date"
      });
      return z.NEVER;
    }

    return date;
  });

export const createExamSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional().nullable(),
  token: z.string().min(4).max(32).toUpperCase(),
  durationMinutes: z.number().int().positive().max(600),
  startAt: dateString,
  endAt: dateString,
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  status: z.enum(["draft", "scheduled", "active", "finished"]).default("draft")
});

export const updateExamSchema = createExamSchema.partial();

export const createParticipantSchema = z.object({
  nim: z.string().min(4).max(32),
  name: z.string().min(2),
  prodi: z.string().min(2),
  className: z.string().min(1)
});

export const registerParticipantSchema = z
  .object({
    participantId: z.string().min(1).optional(),
    nim: z.string().min(4).optional()
  })
  .refine((value) => value.participantId || value.nim, {
    message: "participantId or nim is required"
  });

export const importExamParticipantsSchema = z
  .object({
    participants: z
      .array(
        z.object({
          name: z.string().min(2),
          nim: z.string().min(4).max(32)
        })
      )
      .optional(),
    rows: z.string().optional()
  })
  .transform((value, ctx) => {
    const parsedFromRows = (value.rows ?? "")
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row) => {
        const [nim, ...nameParts] = row.includes(",")
          ? row.split(",").map((part) => part.trim())
          : row.split(/\s+/);

        return {
          name: nameParts.join(" ").trim(),
          nim: nim?.trim() ?? ""
        };
      });
    const participants = [...(value.participants ?? []), ...parsedFromRows];
    const unique = new Map<string, { name: string; nim: string }>();

    for (const participant of participants) {
      const nim = participant.nim.trim();
      const name = participant.name.trim();

      if (!nim || !name) {
        ctx.addIssue({
          code: "custom",
          message: "Setiap baris wajib berisi NIM dan Nama"
        });
        continue;
      }

      unique.set(nim, { name, nim });
    }

    if (unique.size === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Minimal satu peserta wajib diisi"
      });
    }

    return {
      participants: Array.from(unique.values())
    };
  });

export const createQuestionSchema = z.object({
  order: z.number().int().positive(),
  type: z.enum(["multiple_choice", "short_answer", "essay"]),
  prompt: z.string().min(5),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1)
      })
    )
    .optional()
    .nullable(),
  answerKey: z.string().optional().nullable(),
  score: z.number().positive().default(1)
});

export const startExamSchema = z.object({
  nim: z.string().min(4),
  token: z.string().min(4).toUpperCase()
});

export const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().optional().nullable()
});

export const violationSchema = z.object({
  type: z.string().min(2),
  metadata: z.record(z.string(), z.unknown()).optional().nullable()
});
