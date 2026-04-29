#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import analysisPrompt from "../lib/analysis/prompt.js";

const { ANALYSIS_MODEL, ANALYSIS_SYSTEM_PROMPT } = analysisPrompt;

const DEFAULT_PROBLEM_DIR = "assets/教科書ガイド 二次関数 問題";
const DEFAULT_ANSWER_DIR = "assets/教科書ガイド 数Ⅰ 二次関数 解答";
const DEFAULT_OUT_ROOT = ".artifacts/quadratic-eval";

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");

  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Add it to .env.local or export it.");
  }

  const problemDir = resolve(args.problemDir ?? DEFAULT_PROBLEM_DIR);
  const answerDir = resolve(args.answerDir ?? DEFAULT_ANSWER_DIR);
  const pairs = await buildPairs(problemDir, answerDir, args.pairMap);
  if (pairs.length === 0) {
    throw new Error("No numbered problem/answer image pairs were found.");
  }

  const selected = selectPairs(pairs, args);
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(args.out ?? join(DEFAULT_OUT_ROOT, runId));
  await mkdir(outDir, { recursive: true });

  const client = new Anthropic({ apiKey });
  const resultPath = join(outDir, "results.jsonl");
  const manifest = {
    created_at: new Date().toISOString(),
    analysis_model: args.model ?? ANALYSIS_MODEL,
    judge_model: args.judgeModel ?? args.model ?? ANALYSIS_MODEL,
    problem_dir: problemDir,
    answer_dir: answerDir,
    pair_map: args.pairMap ? resolve(args.pairMap) : null,
    total_pairs_found: pairs.length,
    selected_cases: selected.map((pair) => ({
      case_id: pair.caseId,
      problem_image: pair.problemPath,
      answer_images: pair.answerPaths,
    })),
  };
  await writeJson(join(outDir, "manifest.json"), manifest);
  await writeFile(resultPath, "", "utf8");

  const results = [];
  for (const [index, pair] of selected.entries()) {
    console.log(`[${index + 1}/${selected.length}] case ${pair.caseId}: analyzing`);
    const startedAt = Date.now();
    const result = await runCase(client, pair, {
      analysisModel: args.model ?? ANALYSIS_MODEL,
      judgeModel: args.judgeModel ?? args.model ?? ANALYSIS_MODEL,
    });
    result.elapsed_ms = Date.now() - startedAt;
    results.push(result);
    await appendJsonLine(resultPath, result);
    console.log(
      `  schema=${result.schema.ok ? "ok" : "ng"} judge=${result.judge?.score ?? "n/a"}`
    );
  }

  const summary = summarize(results);
  await writeJson(join(outDir, "summary.json"), summary);
  await writeFile(join(outDir, "improvement-notes.md"), buildNotes(summary, results), "utf8");

  console.log(`\nWrote ${outDir}`);
  console.log(`Pass rate: ${summary.pass_rate} (${summary.pass_count}/${summary.case_count})`);
  console.log(`Average judge score: ${summary.average_judge_score ?? "n/a"}`);
}

async function runCase(client, pair, options) {
  const [problemImage, answerImages] = await Promise.all([
    imageContent(pair.problemPath),
    Promise.all(pair.answerPaths.map((path) => imageContent(path))),
  ]);
  const answerContent = answerImages.flatMap((answerImage, index) => [
    answerImage,
    {
      type: "text",
      text: `上の画像は解答です。${answerImages.length > 1 ? `解答 ${index + 1}/${answerImages.length} です。` : ""}`,
    },
  ]);

  let analysis = null;
  let analysisRaw = "";
  let analysisError = null;

  try {
    const response = await client.messages.create({
      model: options.analysisModel,
      max_tokens: 2500,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            problemImage,
            { type: "text", text: "上の画像は問題です。" },
            ...answerContent,
            {
              type: "text",
              text: "これらの解答画像は同じ問題に対する解答の続きである可能性があります。全画像を順番に確認して、指定された JSON 形式で結果を返してください。",
            },
          ],
        },
      ],
    });
    analysisRaw = textFromResponse(response);
    analysis = parseJsonObject(analysisRaw);
  } catch (error) {
    analysisError = error instanceof Error ? error.message : String(error);
  }

  const schema = validateAnalysis(analysis);
  let judge = null;
  let judgeRaw = "";
  let judgeError = null;

  if (analysis) {
    try {
      const response = await client.messages.create({
        model: options.judgeModel,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              problemImage,
              { type: "text", text: "上の画像は問題です。" },
              ...answerImages.flatMap((answerImage, index) => [
                answerImage,
                {
                  type: "text",
                  text: `上の画像は正解・解答です。${answerImages.length > 1 ? `解答 ${index + 1}/${answerImages.length} です。` : ""}`,
                },
              ]),
              {
                type: "text",
                text: [
                  "次の解析JSONを、解答画像に照らして採点してください。",
                  "採点対象は最終答え、式変形、小問対応、二次関数としての説明の正確さです。",
                  "問題画像と解答画像が別問題に見える場合は pairing_issue を true にしてください。",
                  "JSONのみで返してください: {\"score\":0-100,\"pass\":true/false,\"pairing_issue\":true/false,\"issues\":[...],\"missing\":[...],\"suggested_prompt_fix\":\"...\"}",
                  "",
                  JSON.stringify(analysis),
                ].join("\n"),
              },
            ],
          },
        ],
      });
      judgeRaw = textFromResponse(response);
      judge = normalizeJudge(parseJsonObject(judgeRaw));
    } catch (error) {
      judgeError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    case_id: pair.caseId,
    problem_image: pair.problemPath,
    answer_images: pair.answerPaths,
    analysis,
    analysis_raw: analysisRaw,
    analysis_error: analysisError,
    schema,
    judge,
    judge_raw: judgeRaw,
    judge_error: judgeError,
  };
}

async function buildPairs(problemDir, answerDir, pairMapPath) {
  const [problemFiles, answerFiles] = await Promise.all([
    numberedImages(problemDir),
    numberedImages(answerDir),
  ]);
  const problemByNumber = new Map(problemFiles.map((file) => [file.number, file.path]));
  const answerByNumber = new Map(answerFiles.map((file) => [file.number, file.path]));

  if (pairMapPath) {
    const pairMap = JSON.parse(await readFile(resolve(pairMapPath), "utf8"));
    const entries = Array.isArray(pairMap)
      ? pairMap.map((item) => [
          Number(item.problem),
          normalizeAnswerNumbers(item.answers ?? item.answer),
          item.case_id,
        ])
      : Object.entries(pairMap).map(([problem, answer]) => [
          Number(problem),
          normalizeAnswerNumbers(answer),
          problem,
        ]);

    return entries.flatMap(([problemNumber, answerNumbers, caseId]) => {
      const problemPath = problemByNumber.get(problemNumber);
      const answerPaths = answerNumbers.flatMap((answerNumber) => {
        const answerPath = answerByNumber.get(answerNumber);
        return answerPath ? [answerPath] : [];
      });
      if (!problemPath || answerPaths.length === 0) return [];
      return [{
        caseId: String(caseId ?? problemNumber),
        problemPath,
        answerPaths,
      }];
    });
  }

  return problemFiles
    .filter((file) => answerByNumber.has(file.number))
    .map((file) => ({
      caseId: String(file.number),
      problemPath: file.path,
      answerPaths: [answerByNumber.get(file.number)],
    }));
}

async function numberedImages(dir) {
  await stat(dir);
  const entries = await readdir(dir);
  return entries
    .flatMap((entry) => {
      const extension = extname(entry).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) return [];
      const match = basename(entry, extension).match(/_(\d+)$/);
      if (!match) return [];
      return [{ number: Number(match[1]), path: join(dir, entry) }];
    })
    .sort((a, b) => a.number - b.number);
}

function selectPairs(pairs, args) {
  let selected = pairs;
  if (args.caseIds.length > 0) {
    const wanted = new Set(args.caseIds);
    selected = selected.filter((pair) => wanted.has(pair.caseId));
  }
  if (args.start) {
    selected = selected.filter((pair) => Number(pair.caseId) >= Number(args.start));
  }
  if (!args.all) {
    selected = selected.slice(0, Number(args.limit ?? 5));
  }
  return selected;
}

async function imageContent(path) {
  const data = await readFile(path);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType(path),
      data: data.toString("base64"),
    },
  };
}

function mediaType(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function validateAnalysis(value) {
  const issues = [];
  if (!isRecord(value)) {
    return { ok: false, issues: ["analysis is not a JSON object"] };
  }
  for (const key of [
    "problem_summary",
    "topic",
    "solution_outline",
    "why_this_method",
    "common_pitfalls",
  ]) {
    if (!(key in value) || value[key] === null || value[key] === "") {
      issues.push(`missing ${key}`);
    }
  }
  if (!Array.isArray(value.solution_outline)) {
    issues.push("solution_outline must be an array");
  }
  if (!Array.isArray(value.common_pitfalls)) {
    issues.push("common_pitfalls must be an array");
  }
  if (value.solution_result !== null) {
    if (!isRecord(value.solution_result)) {
      issues.push("solution_result must be object or null");
    } else if (
      typeof value.solution_result.final_answer !== "string"
      || !value.solution_result.final_answer.trim()
    ) {
      issues.push("solution_result.final_answer is missing");
    }
  }
  if (value.visual_model !== null && !isRecord(value.visual_model)) {
    issues.push("visual_model must be object or null");
  }
  if (isRecord(value.visual_model)) {
    const type = value.visual_model.diagram_type;
    if (type !== "right_triangle" && type !== "triangle") {
      issues.push("visual_model.diagram_type is unsupported");
    }
  }
  return { ok: issues.length === 0, issues };
}

function normalizeJudge(value) {
  if (!isRecord(value)) return null;
  const score = Number(value.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
    pass: value.pass === true,
    pairing_issue:
      value.pairing_issue === true
      || looksLikePairingIssue(value.issues)
      || looksLikePairingIssue(value.missing),
    issues: Array.isArray(value.issues) ? value.issues.map(String) : [],
    missing: Array.isArray(value.missing) ? value.missing.map(String) : [],
    suggested_prompt_fix:
      typeof value.suggested_prompt_fix === "string" ? value.suggested_prompt_fix : "",
  };
}

function summarize(results) {
  const judged = results.filter((result) => result.judge?.score !== null);
  const pairingIssues = results.filter((result) => result.judge?.pairing_issue === true);
  const modelFailures = results.filter(
    (result) =>
      (!result.schema.ok || result.judge?.pass !== true)
      && result.judge?.pairing_issue !== true
  );
  const passCount = results.filter(
    (result) => result.schema.ok && result.judge?.pass === true
  ).length;
  const average =
    judged.length === 0
      ? null
      : Math.round(
          (judged.reduce((sum, result) => sum + result.judge.score, 0) / judged.length) * 10
        ) / 10;

  return {
    case_count: results.length,
    schema_pass_count: results.filter((result) => result.schema.ok).length,
    pass_count: passCount,
    pass_rate: results.length === 0 ? "0.0%" : `${((passCount / results.length) * 100).toFixed(1)}%`,
    pairing_issue_count: pairingIssues.length,
    model_failure_count: modelFailures.length,
    average_judge_score: average,
    failed_cases: results
      .filter((result) => !result.schema.ok || result.judge?.pass !== true)
      .map((result) => ({
        case_id: result.case_id,
        schema_issues: result.schema.issues,
        judge_score: result.judge?.score ?? null,
        pairing_issue: result.judge?.pairing_issue === true,
        judge_issues: result.judge?.issues ?? [],
        missing: result.judge?.missing ?? [],
      })),
  };
}

function buildNotes(summary, results) {
  const promptFixes = results
    .map((result) => result.judge?.suggested_prompt_fix)
    .filter(Boolean);
  const lines = [
    "# Quadratic Evaluation Notes",
    "",
    `- Cases: ${summary.case_count}`,
    `- Pass rate: ${summary.pass_rate}`,
    `- Pairing issues: ${summary.pairing_issue_count}`,
    `- Model failures after excluding pairing issues: ${summary.model_failure_count}`,
    `- Average judge score: ${summary.average_judge_score ?? "n/a"}`,
    "",
    "## Failed Cases",
    "",
  ];

  if (summary.failed_cases.length === 0) {
    lines.push("- None");
  } else {
    for (const failed of summary.failed_cases) {
      lines.push(
        `- Case ${failed.case_id}: score=${failed.judge_score ?? "n/a"}; pairing_issue=${failed.pairing_issue}; issues=${[
          ...failed.schema_issues,
          ...failed.judge_issues,
          ...failed.missing.map((item) => `missing: ${item}`),
        ].join(" / ") || "n/a"}`
      );
    }
  }

  lines.push("", "## Prompt Fix Candidates", "");
  if (promptFixes.length === 0) {
    lines.push("- None");
  } else {
    for (const fix of [...new Set(promptFixes)]) {
      lines.push(`- ${fix}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function textFromResponse(response) {
  const block = response.content.find((item) => item.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Model response did not include a text block.");
  }
  return block.text;
}

function parseJsonObject(raw) {
  const trimmed = raw.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

async function appendJsonLine(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, { flag: "a" });
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = { caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") args.all = true;
    else if (arg === "--limit") args.limit = argv[++index];
    else if (arg === "--start") args.start = argv[++index];
    else if (arg === "--case") args.caseIds.push(argv[++index]);
    else if (arg === "--problem-dir") args.problemDir = argv[++index];
    else if (arg === "--answer-dir") args.answerDir = argv[++index];
    else if (arg === "--pair-map") args.pairMap = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--judge-model") args.judgeModel = argv[++index];
    else if (arg === "--help") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`usage: npm run eval:quadratic -- [options]

Options:
  --all                         run all numbered pairs
  --limit <n>                   run first n pairs (default: 5)
  --case <n>                    run a specific case; can be repeated
  --start <n>                   start from a numbered case
  --problem-dir <path>          override problem image directory
  --answer-dir <path>           override answer image directory
  --pair-map <path>             JSON object of problem number to answer number(s)
  --out <path>                  output directory
  --model <name>                analysis model override
  --judge-model <name>          judge model override
`);
}

function loadDotEnv(path) {
  try {
    if (!existsSync(path)) return;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Ignore optional env files.
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function normalizeAnswerNumbers(value) {
  if (Array.isArray(value)) {
    return value.flatMap(normalizeAnswerNumbers);
  }
  if (typeof value === "string" && value.includes("-")) {
    const [start, end] = value.split("-").map(Number);
    if (Number.isInteger(start) && Number.isInteger(end) && start <= end) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }
  const number = Number(value);
  return Number.isInteger(number) ? [number] : [];
}

function looksLikePairingIssue(value) {
  if (!Array.isArray(value)) return false;
  return value.map(String).some((text) =>
    /問題.*解答.*不一致|解答.*問題.*不一致|問題番号|別問題|異なる問題|完全に異なる|一致していない/.test(text)
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
