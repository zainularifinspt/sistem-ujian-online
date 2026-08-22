export type AnswerFormat = "text" | "math";

const MATH_DELIMITERS = [
  { open: "\\(", close: "\\)" },
  { open: "\\[", close: "\\]" },
  { open: "$$", close: "$$" },
  { open: "$", close: "$" }
] as const;

function matchingDelimiter(value: string) {
  const trimmed = value.trim();

  return MATH_DELIMITERS.find(
    ({ open, close }) =>
      trimmed.startsWith(open) &&
      trimmed.endsWith(close) &&
      trimmed.length >= open.length + close.length
  );
}

export function detectAnswerFormat(value: string | null | undefined): AnswerFormat {
  return value && matchingDelimiter(value) ? "math" : "text";
}

export function unwrapMathAnswer(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  const delimiter = matchingDelimiter(trimmed);

  if (!delimiter) {
    return trimmed;
  }

  return trimmed
    .slice(delimiter.open.length, trimmed.length - delimiter.close.length)
    .trim();
}

export function wrapMathAnswer(value: string | null | undefined) {
  const unwrapped = unwrapMathAnswer(value);

  return unwrapped ? `\\(${unwrapped}\\)` : "";
}

export function answersMatchExactly(answerKey: string, studentAnswer: string) {
  const answerFormat = detectAnswerFormat(answerKey);
  const studentFormat = detectAnswerFormat(studentAnswer);

  if (answerFormat === "math" || studentFormat === "math") {
    const normalizeLatex = (value: string) =>
      unwrapMathAnswer(value)
        .replace(/\\left|\\right/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();

    return normalizeLatex(answerKey) === normalizeLatex(studentAnswer);
  }

  return studentAnswer.trim().toLowerCase() === answerKey.trim().toLowerCase();
}
