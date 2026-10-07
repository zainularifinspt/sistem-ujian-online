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

// Convert supported legacy LaTeX to plain notation without executing expressions.
export function mathAnswerToText(value: string) {
  let result = unwrapMathAnswer(value).replace(/\\left|\\right|\\[,;! ]/g, "")
    .replace(/\\(?:cdot|times)/g, "*").replace(/\\div/g, "/")
    .replace(/\\(?:dfrac|tfrac)/g, "\\frac");
  for (let i = 0; i < 20; i++) {
    const next = result.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
      .replace(/\^\{([^{}]+)\}/g, "^($1)");
    if (next === result) break;
    result = next;
  }
  return result.replace(/(?<![a-zA-Z0-9])\(([+-]?\d+(?:[.,]\d+)?|[a-zA-Z])\)/g, "$1");
}

function numericValue(value: string): number | null {
  if (value.length > 200) return null;
  const compact = value.replace(/\s+/g, "").replace(/,/g, ".");
  const tokens = compact.match(/sqrt|\d+(?:\.\d+)?|\.\d+|[+\-*/^()]/g) ?? [];
  if (tokens.join("") !== compact || !tokens.length) return null;
  let index = 0, depth = 0;
  const atom = (): number => {
    if (++depth > 32) throw new Error("Expression too deep");
    const token = tokens[index++];
    let value: number;
    if (token === "sqrt") { if (tokens[index++] !== "(") throw new Error(); value = Math.sqrt(add()); if (tokens[index++] !== ")") throw new Error(); }
    else if (token === "(") { value = add(); if (tokens[index++] !== ")") throw new Error(); }
    else { if (!token || !/^(?:\d|\.)/.test(token)) throw new Error(); value = Number(token); }
    depth--;
    return value;
  };
  const power = (): number => { const value = atom(); return tokens[index] === "^" ? (index++, value ** unary()) : value; };
  const unary = (): number => tokens[index] === "-" ? (index++, -unary()) : tokens[index] === "+" ? (index++, unary()) : power();
  const multiply = (): number => { let value = unary(); while (["*", "/"].includes(tokens[index])) { const op = tokens[index++], rhs = unary(); value = op === "*" ? value * rhs : value / rhs; } return value; };
  const add = (): number => { let value = multiply(); while (["+", "-"].includes(tokens[index])) { const op = tokens[index++], rhs = multiply(); value = op === "+" ? value + rhs : value - rhs; } return value; };
  try { const result = add(); return index === tokens.length && Number.isFinite(result) ? result : null; } catch { return null; }
}

export function answersMatchExactly(answerKey: string, studentAnswer: string) {
  const math = detectAnswerFormat(answerKey) === "math" || detectAnswerFormat(studentAnswer) === "math" || /\\(?:frac|sqrt|times|cdot)\b/.test(answerKey);
  if (math) {
    const key = mathAnswerToText(answerKey).replace(/\s+/g, "");
    const answer = mathAnswerToText(studentAnswer).replace(/\s+/g, "");
    if (key === answer) return true;
    const keyNumber = numericValue(key), answerNumber = numericValue(answer);
    return keyNumber !== null && answerNumber !== null && keyNumber === answerNumber;
  }
  return studentAnswer.trim().toLowerCase() === answerKey.trim().toLowerCase();
}
