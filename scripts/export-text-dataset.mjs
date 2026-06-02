#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DEFAULT_RESULTS = ".artifacts/quadratic-eval/final/results.jsonl";
const DEFAULT_OUT = ".artifacts/text-dataset/quadratic-final";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsPath = resolve(args.results ?? DEFAULT_RESULTS);
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  const rows = await readJsonl(resultsPath);
  const humanReviews = args.humanReviews ? await readHumanReviews(resolve(args.humanReviews)) : new Map();
  const records = rows.map((row) => toDatasetRecord(row, humanReviews.get(String(row.case_id)) ?? []));
  const summary = summarize(records, resultsPath, outDir);

  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "dataset.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8"
  );
  await writeFile(join(outDir, "dataset.json"), `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(outDir, "dataset.md"), buildMarkdown(records, summary), "utf8");

  console.log(JSON.stringify({
    ok: true,
    out_dir: outDir,
    dataset_jsonl: join(outDir, "dataset.jsonl"),
    case_count: records.length,
  }, null, 2));
}

function toDatasetRecord(row, humanReviews) {
  const analysis = row.analysis ?? {};
  const solution = analysis.solution_result ?? {};
  const calculationSteps = asArray(solution.calculation_steps).map((step, index) => ({
    step_number: index + 1,
    narration: clean(step?.narration),
    formula: clean(step?.formula),
  }));
  const problemText = buildProblemText(analysis);
  const answerText = buildAnswerText(calculationSteps, solution);

  return {
    version: 1,
    case_id: String(row.case_id),
    subject: "math",
    domain: "quadratic_functions",
    topic: clean(analysis.topic),
    problem_text: problemText,
    answer_text: answerText,
    final_answer: clean(solution.final_answer),
    answer_unit: solution.answer_unit ?? null,
    solution_outline: asArray(analysis.solution_outline).map(clean).filter(Boolean),
    why_this_method: clean(analysis.why_this_method),
    common_pitfalls: asArray(analysis.common_pitfalls).map(clean).filter(Boolean),
    calculation_steps: calculationSteps,
    source_images: {
      problem: row.problem_image,
      answers: asArray(row.answer_images ?? row.answer_image).filter(Boolean),
    },
    extraction: {
      source: "vision_analysis",
      raw_available: Boolean(row.analysis_raw),
      analysis_error: row.analysis_error ?? null,
      schema_ok: row.schema?.ok === true,
      strict_ocr: false,
      note: "problem_text は画像からの構造化要約です。原文完全OCRではありません。",
    },
    source_judge: {
      score: row.judge?.score ?? null,
      pass: row.judge?.pass === true,
      pairing_issue: row.judge?.pairing_issue === true,
      issues: asArray(row.judge?.issues).map(clean).filter(Boolean),
      missing: asArray(row.judge?.missing).map(clean).filter(Boolean),
      suggested_prompt_fix: clean(row.judge?.suggested_prompt_fix),
    },
    human_reviews: humanReviews,
    quality_flags: buildQualityFlags(row, humanReviews),
  };
}

function buildProblemText(analysis) {
  const lines = [
    clean(analysis.problem_summary),
  ].filter(Boolean);
  return lines.join("\n");
}

function buildAnswerText(calculationSteps, solution) {
  const lines = [];
  for (const step of calculationSteps) {
    if (step.narration) lines.push(`${step.step_number}. ${step.narration}`);
    if (step.formula) lines.push(`   ${step.formula}`);
  }
  const finalAnswer = clean(solution.final_answer);
  if (finalAnswer) {
    lines.push("最終答え:");
    lines.push(finalAnswer);
  }
  return lines.join("\n");
}

function buildQualityFlags(row, humanReviews) {
  const flags = [];
  if (row.judge?.pass !== true) flags.push("source_judge_failed");
  if (row.judge?.pairing_issue === true) flags.push("pairing_issue");
  if (row.analysis_error) flags.push("analysis_error");
  if (row.schema?.ok !== true) flags.push("schema_issue");
  if (!clean(row.analysis?.problem_summary)) flags.push("missing_problem_text");
  if (!clean(row.analysis?.solution_result?.final_answer)) flags.push("missing_final_answer");
  if (asArray(row.analysis?.solution_result?.calculation_steps).length === 0) flags.push("missing_calculation_steps");
  if (humanReviews.some((review) => review.status === "needs_fix" || review.status === "blocker")) flags.push("human_review_needs_fix");
  return flags;
}

function summarize(records, input, outDir) {
  const flagCounts = {};
  for (const record of records) {
    for (const flag of record.quality_flags) {
      flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
    }
  }
  return {
    created_at: new Date().toISOString(),
    input,
    output_dir: outDir,
    case_count: records.length,
    source_pass_count: records.filter((record) => record.source_judge.pass).length,
    human_review_count: records.reduce((sum, record) => sum + record.human_reviews.length, 0),
    flag_counts: flagCounts,
    files: {
      jsonl: "dataset.jsonl",
      json: "dataset.json",
      markdown: "dataset.md",
    },
  };
}

function buildMarkdown(records, summary) {
  const lines = [
    "# Quadratic Text Dataset",
    "",
    `- Cases: ${summary.case_count}`,
    `- Source pass count: ${summary.source_pass_count}`,
    `- Human review count: ${summary.human_review_count}`,
    "",
    "## Records",
    "",
  ];

  for (const record of records) {
    lines.push(`### Case ${record.case_id}`, "");
    lines.push(`- Topic: ${record.topic || "n/a"}`);
    lines.push(`- Flags: ${record.quality_flags.length ? record.quality_flags.join(", ") : "none"}`);
    lines.push("");
    lines.push("Problem:");
    lines.push("");
    lines.push(record.problem_text || "n/a");
    lines.push("");
    lines.push("Answer:");
    lines.push("");
    lines.push(record.answer_text || "n/a");
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

async function readHumanReviews(path) {
  const payload = JSON.parse(await readFile(path, "utf8"));
  const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  const byCase = new Map();
  for (const review of reviews) {
    const caseId = String(review.case_id ?? "");
    if (!caseId) continue;
    if (!byCase.has(caseId)) byCase.set(caseId, []);
    byCase.get(caseId).push(review);
  }
  return byCase;
}

async function readJsonl(path) {
  const content = await readFile(path, "utf8");
  return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--results") args.results = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--human-reviews") args.humanReviews = argv[++index];
    else if (arg === "--help") {
      console.log("usage: npm run dataset:export -- [--results results.jsonl] [--out dir] [--human-reviews human-slide-reviews.json]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
