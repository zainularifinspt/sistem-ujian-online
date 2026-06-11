"use client";

import katex from "katex";

type MathContentProps = {
  className?: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function isEscaped(value: string, index: number) {
  let slashes = 0;

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }

  return slashes % 2 === 1;
}

function findUnescapedDollar(value: string, from: number) {
  for (let index = from; index < value.length; index += 1) {
    if (value[index] === "$" && value[index + 1] !== "$" && !isEscaped(value, index)) {
      return index;
    }
  }

  return -1;
}

function findNextDelimiter(value: string, from: number) {
  const candidates = [
    { index: value.indexOf("$$", from), open: "$$", close: "$$" },
    { index: value.indexOf("\\[", from), open: "\\[", close: "\\]" },
    { index: value.indexOf("\\(", from), open: "\\(", close: "\\)" },
    { index: findUnescapedDollar(value, from), open: "$", close: "$" }
  ].filter((candidate) => candidate.index >= 0);

  return candidates.sort((a, b) => a.index - b.index)[0] ?? null;
}

function findClosingDelimiter(
  value: string,
  from: number,
  close: string
) {
  if (close !== "$") {
    return value.indexOf(close, from);
  }

  return findUnescapedDollar(value, from);
}

function renderMath(value: string) {
  const isBlock = value.startsWith("$$") || value.startsWith("\\[");
  const expression =
    value.startsWith("$$")
      ? value.slice(2, -2)
      : value.startsWith("\\[")
        ? value.slice(2, -2)
        : value.startsWith("\\(")
          ? value.slice(2, -2)
          : value.slice(1, -1);

  try {
    return katex.renderToString(expression.trim(), {
      displayMode: isBlock,
      output: "html",
      strict: false,
      throwOnError: false,
      trust: false
    });
  } catch {
    return textToHtml(value);
  }
}

function renderMixedContent(text: string) {
  let cursor = 0;
  let html = "";

  while (cursor < text.length) {
    const delimiter = findNextDelimiter(text, cursor);

    if (!delimiter) {
      html += textToHtml(text.slice(cursor));
      break;
    }

    const contentStart = delimiter.index + delimiter.open.length;
    const contentEnd = findClosingDelimiter(text, contentStart, delimiter.close);

    if (contentEnd < 0) {
      html += textToHtml(text.slice(cursor));
      break;
    }

    const token = text.slice(delimiter.index, contentEnd + delimiter.close.length);
    html += textToHtml(text.slice(cursor, delimiter.index));
    html += renderMath(token);
    cursor = contentEnd + delimiter.close.length;
  }

  return html;
}

export function MathContent({ className, text }: MathContentProps) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMixedContent(text) }}
    />
  );
}
