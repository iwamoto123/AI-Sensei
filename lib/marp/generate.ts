import type { Explanation } from "@/lib/types";

const SLIDE_SEPARATOR = "\n\n---\n\n";

function frontMatter(theme: string): string {
  return [
    "---",
    "marp: true",
    `theme: ${theme}`,
    "paginate: true",
    "---",
  ].join("\n");
}

function titleSlide(explanation: Explanation): string {
  return `# ${explanation.topic}\n\n${explanation.problem_summary}`;
}

function problemSlide(explanation: Explanation): string {
  return `## 問題の要約\n\n${explanation.problem_summary}`;
}

function solutionSlide(explanation: Explanation): string {
  const steps = explanation.solution_outline
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `- ${line.replace(/^\d+\.\s*/, "")}`)
    .join("\n");

  return `## 解法の流れ\n\n${steps}`;
}

function reasonSlide(explanation: Explanation): string {
  return `## なぜこの解法を使うのか\n\n${explanation.why_this_method}`;
}

function pitfallsSlide(explanation: Explanation): string {
  const points = explanation.common_pitfalls
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `- ${line.replace(/^\d+\.\s*/, "")}`)
    .join("\n");

  return `## つまずきやすいポイント\n\n${points}`;
}

/**
 * Explanation から Marp Markdown を生成する純粋関数。
 * テスト可能: 副作用なし、入力と出力のみ。
 */
export function generateMarpMarkdown(
  explanation: Explanation,
  theme: string = "default"
): string {
  const slides = [
    frontMatter(theme),
    titleSlide(explanation),
    problemSlide(explanation),
    solutionSlide(explanation),
    reasonSlide(explanation),
    pitfallsSlide(explanation),
  ];

  return slides.join(SLIDE_SEPARATOR);
}
