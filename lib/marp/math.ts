const WORD_TOKENS = ["高さ", "底辺", "斜辺", "答え"];

import katex from "katex";

export function formulaToHtml(formula: string): string {
  const tex = formulaToTex(formula);
  const html = katex.renderToString(tex, {
    displayMode: true,
    throwOnError: false,
    strict: "ignore",
    output: "html",
  });

  return `<div class="${mathSizeClass(tex)}">${html}</div>`;
}

export function formulaToTex(formula: string): string {
  const answerMatch = /^答え[:：]\s*/.test(formula);
  const normalized = formula
    .replace(/^答え[:：]\s*/, "")
    .replace(/\{frac\{([^{}]+)\}\{([^{}]+)\}\}/g, "\\frac{$1}{$2}")
    .replace(/\{sqrt\{([^{}]+)\}\}/g, "\\sqrt{$1}")
    .replace(/×/g, "\\times ")
    .replace(/÷/g, "\\div ")
    .replace(/−/g, "-")
    .replace(/°/g, "^\\circ")
    .trim();

  const tex = normalized
    .split("=")
    .map((part) => convertExpression(part.trim()))
    .join(" = ");

  return answerMatch ? `\\text{答え} = ${tex}` : tex;
}

function convertExpression(expression: string): string {
  let result = expression;

  for (const word of WORD_TOKENS) {
    result = result.replaceAll(word, `\\text{${word}}`);
  }

  result = result
    .replace(/√\s*(\d+|[a-zA-Z]+)/g, "\\sqrt{$1}")
    .replace(/(?<!\\)(sin|cos|tan)\s*(\d+(?:\.\d+)?)\^\\circ/g, "\\$1 $2^\\circ")
    .replace(/(?<!\\)(sin|cos|tan)\s*(\d+(?:\.\d+)?)/g, "\\$1 $2")
    .replace(/\s+/g, " ");

  return convertSimpleFractions(result);
}

function convertSimpleFractions(expression: string): string {
  return expression.replace(
    /(\\text\{[^}]+\}|[A-Za-z0-9]+)\s*\/\s*(\\(?:sin|cos|tan)\s*\d+(?:\.\d+)?\^\\circ|\\sqrt\{[^}]+\}|\\text\{[^}]+\}|[A-Za-z0-9]+)/g,
    "\\frac{$1}{$2}"
  );
}

function mathSizeClass(tex: string): string {
  if (tex.length > 54) return "math-fit math-fit-sm";
  if (tex.length > 36) return "math-fit math-fit-md";
  return "math-fit";
}
