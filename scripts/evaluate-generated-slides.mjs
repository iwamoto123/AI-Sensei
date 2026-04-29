#!/usr/bin/env node

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import analysisPrompt from "../lib/analysis/prompt.js";

const { ANALYSIS_MODEL } = analysisPrompt;

const DEFAULT_RESULTS = ".artifacts/quadratic-eval/final/results.jsonl";
const DEFAULT_SLIDES_DIR = ".artifacts/slides/quadratic-final-v2";
const DEFAULT_OUT = ".artifacts/slide-quality/quadratic-final-v2";

async function main() {
  loadDotEnv(".env.local");
  loadDotEnv(".env");

  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing. Add it to .env.local or export it.");
  }

  const resultsPath = resolve(args.results ?? DEFAULT_RESULTS);
  const slidesDir = resolve(args.slidesDir ?? DEFAULT_SLIDES_DIR);
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  await mkdir(outDir, { recursive: true });

  const rows = selectRows(await readJsonl(resultsPath), args);
  const client = new Anthropic({ apiKey });
  const resultPath = join(outDir, "results.jsonl");
  await writeFile(resultPath, "", "utf8");

  const results = [];
  for (const [index, row] of rows.entries()) {
    console.log(`[${index + 1}/${rows.length}] case ${row.case_id}: judging slide quality`);
    const judged = await judgeCase(client, row, slidesDir, args.model ?? ANALYSIS_MODEL);
    results.push(judged);
    await writeFile(resultPath, `${JSON.stringify(judged)}\n`, { flag: "a" });
    console.log(
      `  answer=${judged.judge?.answer_correctness ?? "n/a"} diagram=${judged.judge?.diagram_quality ?? "n/a"} progression=${judged.judge?.progression_quality ?? "n/a"} animation=${judged.judge?.animation_quality ?? "n/a"} pass=${judged.judge?.pass ?? false}`
    );
  }

  const summary = summarize(results);
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(outDir, "improvement-notes.md"), buildNotes(summary, results), "utf8");

  console.log(`\nWrote ${outDir}`);
  console.log(`Pass rate: ${summary.pass_rate} (${summary.pass_count}/${summary.case_count})`);
  console.log(`Average total score: ${summary.average_total_score}`);
}

async function judgeCase(client, row, slidesDir, model) {
  const caseId = String(row.case_id).padStart(2, "0");
  const mdPath = join(slidesDir, `case-${caseId}`, "slides.md");
  const htmlPath = join(slidesDir, `case-${caseId}`, "slides.html");
  const previewPath = join(slidesDir, `case-${caseId}`, "preview.png");
  const slideMarkdown = await readFile(mdPath, "utf8");
  const slideFeatures = inspectSlides(slideMarkdown, existsSync(htmlPath) ? await readFile(htmlPath, "utf8") : "");
  slideFeatures.local_diagram_issues = assessLocalDiagram(row, slideFeatures);
  const imageBlocks = await Promise.all([
    imageContent(row.problem_image),
    ...row.answer_images.map((path) => imageContent(path)),
  ]);
  const previewBlock = existsSync(previewPath) ? await imageContent(previewPath) : null;

  const answerBlocks = imageBlocks.slice(1).flatMap((image, index) => [
    image,
    { type: "text", text: `上の画像は解答 ${index + 1}/${row.answer_images.length} です。` },
  ]);

  let judge = null;
  let raw = "";
  let error = null;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1600,
      messages: [
        {
          role: "user",
          content: [
            imageBlocks[0],
            { type: "text", text: "上の画像は問題です。" },
            ...answerBlocks,
            ...(previewBlock ? [
              previewBlock,
              { type: "text", text: "上の画像は生成スライドのプレビューです。図が見切れていないか、問題の式・点・定義域・図形条件に対応しているかは、このプレビューを優先して確認してください。" },
            ] : []),
            {
              type: "text",
              text: [
                "次の生成済みスライドMarkdownを、問題画像と解答画像に照らして評価してください。",
                "評価観点:",
                "1. answer_correctness: スライド内の答え・式変形が正解と一致しているか。",
                "2. diagram_quality: 図・グラフ・図形が、その問題で扱う関数式、点、頂点、定義域、図形条件に対応しているか。汎用サンプル図や無関係な図なら低くしてください。",
                "   - 関数値を代入して求める問題では、グラフよりも入力・代入式・出力が対応した表や流れ図を高く評価してください。",
                "   - kなどの文字定数を含む最大値・最小値問題では、解く前から数値代入済みのグラフだけを出すと低評価にしてください。軸、頂点、最大/最小値の式、条件式が図で対応していれば高く評価してください。",
                "   - 定義域つきの値域問題では、該当する x の範囲が太線・端点・ラベルで明示されているかを重視してください。",
                "   - 複数の直線・放物線を同じ座標平面に描く問題では、少なくとも主要な解答シーンで同一図上に重ねて比較できることを重視してください。",
                "   - 3元連立方程式などグラフ問題でない場合は、汎用グラフではなく、消去する文字・得られる式・代入の流れが対応した図を評価してください。",
                "3. progression_quality: スライドの順序が、生徒にとって自然な説明になっているか。",
                "4. animation_quality: アニメーション動画または段階表示として成立しているか。静的スライドだけなら低くしてください。",
                "5. slide_usability: 文字量、分割、読みやすさ、授業スライドとしての使いやすさ。",
                "0〜100点で採点し、総合的に合格なら pass=true にしてください。ただし diagram_quality が70未満、または animation_quality が60未満なら pass=false にしてください。",
                "JSONのみで返してください:",
                "{\"answer_correctness\":0,\"diagram_quality\":0,\"progression_quality\":0,\"animation_quality\":0,\"slide_usability\":0,\"total_score\":0,\"pass\":false,\"issues\":[],\"suggested_fixes\":[]}",
                "",
                `ローカル検出したスライド特徴: ${JSON.stringify(slideFeatures)}`,
                "",
                "スライドMarkdown:",
                slideMarkdown,
              ].join("\n"),
            },
          ],
        },
      ],
    });
    raw = textFromResponse(response);
    judge = normalizeJudge(parseJsonObject(raw), slideFeatures.local_diagram_issues);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  return {
    case_id: row.case_id,
    judge_model: model,
    slides_md: mdPath,
    slides_html: htmlPath,
    source_judge_score: row.judge?.score ?? null,
    slide_features: slideFeatures,
    judge,
    judge_raw: raw,
    error,
  };
}

function inspectSlides(markdown, html) {
  const slideCount = (markdown.match(/^---$/gm) ?? []).length - 1;
  const stepHeadingCount = (markdown.match(/^### /gm) ?? []).length;
  const hasCssAnimation = /animation\s*:|@keyframes|transition\s*:/.test(markdown) || /animation\s*:|@keyframes|transition\s*:/.test(html);
  const hasIncrementalReveal = /scene-layer|--step-index|data-marpit-fragment|fragment|incremental/.test(markdown + html);
  const hasMedia = /<video|\.mp4|\.webm|<audio/.test(markdown + html);
  const diagramSpecs = [...markdown.matchAll(/data-diagram-spec="([^"]+)"/g)]
    .map((match) => parseDiagramSpec(match[1]))
    .filter(Boolean);
  const diagramTypes = [...new Set(diagramSpecs.map((spec) => spec.type))];
  const functionExpressions = [...new Set(diagramSpecs.flatMap((spec) =>
    Array.isArray(spec.functions) ? spec.functions.map((fn) => fn.expression).filter(Boolean) : []
  ))];
  const domainLabels = [...new Set(diagramSpecs.flatMap((spec) =>
    Array.isArray(spec.domains) ? spec.domains.map((domain) => domain.label).filter(Boolean) : []
  ))];
  const pointLabels = [...new Set(diagramSpecs.flatMap((spec) =>
    Array.isArray(spec.points) ? spec.points.map((point) => point.label ?? `(${point.x},${point.y})`).filter(Boolean) : []
  ))];
  const substitutionRowCount = diagramSpecs.reduce((sum, spec) =>
    sum + (Array.isArray(spec.rows) ? spec.rows.length : 0), 0);
  const squareCompletionItems = [...new Set(diagramSpecs.flatMap((spec) =>
    Array.isArray(spec.items) ? spec.items.map((item) => item.text).filter(Boolean) : []
  ))];
  const linearSystemLineCount = diagramSpecs.reduce((sum, spec) =>
    sum + (spec.type === "linear_system" && Array.isArray(spec.lines) ? spec.lines.length : 0), 0);
  const parameterLabels = diagramSpecs
    .filter((spec) => spec.type === "parameter_extreme")
    .map((spec) => ({
      axis: spec.axis_label ?? "",
      extreme: spec.extreme_label ?? "",
      resolved_k: spec.resolved_k ?? "",
      resolved_axis: spec.resolved_axis_label ?? "",
      resolved_extreme: spec.resolved_extreme_label ?? "",
    }));
  const diagramSignatures = diagramSpecs.map((spec) => ({
    type: spec.type,
    title: spec.title ?? "",
    functions: Array.isArray(spec.functions) ? spec.functions.map((fn) => fn.expression).filter(Boolean) : [],
    domains: Array.isArray(spec.domains) ? spec.domains.map((domain) => domain.label).filter(Boolean) : [],
    points: Array.isArray(spec.points) ? spec.points.map((point) => point.label ?? `(${point.x},${point.y})`).filter(Boolean) : [],
    rows: Array.isArray(spec.rows) ? spec.rows.length : 0,
    items: Array.isArray(spec.items) ? spec.items.map((item) => item.text).filter(Boolean).slice(0, 4) : [],
    lines: Array.isArray(spec.lines) ? spec.lines.slice(0, 5) : [],
    axis: spec.axis_label ?? "",
    extreme: spec.extreme_label ?? "",
    resolved_axis: spec.resolved_axis_label ?? "",
    resolved_extreme: spec.resolved_extreme_label ?? "",
  })).slice(0, 12);
  const maxFunctionsInOneDiagram = diagramSpecs.reduce((max, spec) =>
    Math.max(max, Array.isArray(spec.functions) ? spec.functions.length : 0), 0);
  return {
    slide_count: Math.max(0, slideCount),
    step_heading_count: stepHeadingCount,
    has_css_animation: hasCssAnimation,
    has_incremental_reveal: hasIncrementalReveal,
    has_video_or_audio: hasMedia,
    diagram_count: diagramSpecs.length,
    diagram_types: diagramTypes,
    function_expressions: functionExpressions.slice(0, 12),
    domain_labels: domainLabels.slice(0, 12),
    point_labels: pointLabels.slice(0, 16),
    substitution_row_count: substitutionRowCount,
    square_completion_items: squareCompletionItems.slice(0, 16),
    linear_system_line_count: linearSystemLineCount,
    parameter_labels: parameterLabels.slice(0, 8),
    diagram_signatures: diagramSignatures,
    max_functions_in_one_diagram: maxFunctionsInOneDiagram,
    has_domain_highlight: /domain-marker|定義域/.test(markdown + html),
    markdown_length: markdown.length,
  };
}

function parseDiagramSpec(raw) {
  try {
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function normalizeJudge(value, localDiagramIssues = []) {
  if (!isRecord(value)) return null;
  const answer = boundedNumber(value.answer_correctness);
  const diagram = localDiagramIssues.length > 0
    ? Math.min(boundedNumber(value.diagram_quality), 69)
    : boundedNumber(value.diagram_quality);
  const progression = boundedNumber(value.progression_quality);
  const animation = boundedNumber(value.animation_quality);
  const usability = boundedNumber(value.slide_usability);
  const total = boundedNumber(value.total_score);

  return {
    answer_correctness: answer,
    diagram_quality: diagram,
    progression_quality: progression,
    animation_quality: animation,
    slide_usability: usability,
    total_score: total,
    pass: value.pass === true && diagram >= 70 && animation >= 60 && localDiagramIssues.length === 0,
    issues: [
      ...(Array.isArray(value.issues) ? value.issues.map(String) : []),
      ...localDiagramIssues.map((issue) => `[local] ${issue}`),
    ],
    suggested_fixes: Array.isArray(value.suggested_fixes) ? value.suggested_fixes.map(String) : [],
  };
}

function assessLocalDiagram(row, slideFeatures) {
  const text = [
    row.analysis?.problem_summary,
    row.analysis?.topic,
    row.analysis?.solution_outline,
    row.analysis?.solution_result?.final_answer,
    ...(Array.isArray(row.analysis?.solution_result?.calculation_steps)
      ? row.analysis.solution_result.calculation_steps.flatMap((step) => [step?.narration, step?.formula])
      : []),
  ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join("\n");
  const issues = [];
  const expectsSubstitution = /f\([^)]+\)|f\(x\)/.test(text) && /代入|関数値|値を求める/.test(text) && !/最大値|最小値|値域/.test(text);
  const expectsParameterExtreme = /k/.test(text) && /最大値|最小値|軸/.test(text) && /x\^?2|x²|二次関数/.test(text);
  const expectsDomain = /(?:<=|≤|≦)\s*x\s*(?:<=|≤|≦)|定義域/.test(text) && /値域|最大値|最小値/.test(text);
  const expectsMultipleGraph = /(?:2つ|3つ|複数).*?(?:グラフ|直線|放物線)|(?:グラフ|直線|放物線).*?(?:2つ|3つ|複数)|座標平面上にかく/.test(text)
    && /グラフ|直線|放物線/.test(text);
  const expectsLinearSystem = /連立方程式/.test(text) && /z|3元|三元/.test(text) && /消去|代入|①|②|③/.test(text);
  const expectsGraph = /グラフ|放物線|直線|座標|値域|最大値|最小値|軸/.test(text)
    && !expectsSubstitution
    && !expectsParameterExtreme
    && !expectsLinearSystem;

  if (slideFeatures.diagram_count === 0) {
    issues.push("図のメタデータが検出できません。");
    return issues;
  }
  if (expectsSubstitution && !slideFeatures.diagram_types.includes("substitution_table")) {
    issues.push("関数値の代入問題なのに、入力・代入式・出力に対応した代入表がありません。");
  }
  if (expectsParameterExtreme && !slideFeatures.diagram_types.includes("parameter_extreme")) {
    issues.push("文字定数を含む最大/最小値問題なのに、軸・頂点・条件式を示すパラメータ図がありません。");
  }
  if (expectsMultipleGraph && slideFeatures.function_expressions.length >= 2 && slideFeatures.max_functions_in_one_diagram < Math.min(3, slideFeatures.function_expressions.length)) {
    issues.push("複数のグラフを同じ座標平面に描く問題なのに、同一図上で比較できるグラフがありません。");
  }
  if (expectsLinearSystem && !slideFeatures.diagram_types.includes("linear_system")) {
    issues.push("連立方程式の問題なのに、消去・代入の流れに対応した図がありません。");
  }
  if (expectsLinearSystem && (slideFeatures.linear_system_line_count ?? 0) < 3) {
    issues.push("連立方程式の図に、具体的な式変形の行が不足しています。");
  }
  if (expectsDomain && (slideFeatures.domain_labels?.length ?? 0) === 0) {
    issues.push("定義域つきの問題なのに、図に定義域ラベルがありません。");
  }
  if (expectsDomain && !slideFeatures.has_domain_highlight) {
    issues.push("定義域つきの問題なのに、図で x の範囲が強調表示されていません。");
  }
  const hasConceptualDiagram = slideFeatures.diagram_types.includes("parameter_extreme")
    || slideFeatures.diagram_types.includes("square_completion");
  if (expectsGraph && !hasConceptualDiagram && slideFeatures.function_expressions.length === 0 && slideFeatures.point_labels.length === 0) {
    issues.push("グラフ・座標問題なのに、関数式や点に対応した図要素がありません。");
  }
  return issues;
}

function summarize(results) {
  const judged = results.filter((item) => item.judge);
  const passCount = judged.filter((item) => item.judge.pass).length;
  const metric = (key) =>
    judged.length === 0
      ? 0
      : Math.round((judged.reduce((sum, item) => sum + item.judge[key], 0) / judged.length) * 10) / 10;

  return {
    case_count: results.length,
    judged_count: judged.length,
    pass_count: passCount,
    pass_rate: results.length === 0 ? "0.0%" : `${((passCount / results.length) * 100).toFixed(1)}%`,
    average_answer_correctness: metric("answer_correctness"),
    average_diagram_quality: metric("diagram_quality"),
    average_progression_quality: metric("progression_quality"),
    average_animation_quality: metric("animation_quality"),
    average_slide_usability: metric("slide_usability"),
    average_total_score: metric("total_score"),
    failed_cases: results
      .filter((item) => !item.judge?.pass)
      .map((item) => ({
        case_id: item.case_id,
        error: item.error,
        judge: item.judge,
        slide_features: item.slide_features,
      })),
  };
}

function buildNotes(summary, results) {
  const lines = [
    "# Slide Quality Evaluation",
    "",
    `- Cases: ${summary.case_count}`,
    `- Pass rate: ${summary.pass_rate}`,
    `- Average answer correctness: ${summary.average_answer_correctness}`,
    `- Average diagram quality: ${summary.average_diagram_quality}`,
    `- Average progression quality: ${summary.average_progression_quality}`,
    `- Average animation quality: ${summary.average_animation_quality}`,
    `- Average slide usability: ${summary.average_slide_usability}`,
    `- Average total score: ${summary.average_total_score}`,
    "",
    "## Failed Cases",
    "",
  ];

  if (summary.failed_cases.length === 0) {
    lines.push("- None");
  } else {
    for (const failed of summary.failed_cases) {
      lines.push(
        `- Case ${failed.case_id}: answer=${failed.judge?.answer_correctness ?? "n/a"}, diagram=${failed.judge?.diagram_quality ?? "n/a"}, progression=${failed.judge?.progression_quality ?? "n/a"}, animation=${failed.judge?.animation_quality ?? "n/a"}, total=${failed.judge?.total_score ?? "n/a"}`
      );
      for (const issue of failed.judge?.issues ?? []) {
        lines.push(`  - ${issue}`);
      }
    }
  }

  lines.push("", "## Suggested Fixes", "");
  const fixes = [...new Set(results.flatMap((item) => item.judge?.suggested_fixes ?? []))];
  if (fixes.length === 0) {
    lines.push("- None");
  } else {
    for (const fix of fixes) lines.push(`- ${fix}`);
  }
  lines.push("");
  return lines.join("\n");
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

async function readJsonl(path) {
  const content = await readFile(path, "utf8");
  return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function selectRows(rows, args) {
  if (args.caseIds.length > 0) {
    const wanted = new Set(args.caseIds);
    return rows.filter((row) => wanted.has(String(row.case_id)));
  }
  if (args.all) return rows;
  return rows.slice(0, Number(args.limit ?? 5));
}

function parseArgs(argv) {
  const args = { caseIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--all") args.all = true;
    else if (arg === "--limit") args.limit = argv[++index];
    else if (arg === "--case") args.caseIds.push(argv[++index]);
    else if (arg === "--results") args.results = argv[++index];
    else if (arg === "--slides-dir") args.slidesDir = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--model") args.model = argv[++index];
    else if (arg === "--help") {
      console.log("usage: npm run slides:judge -- [--all] [--case n] [--results path] [--slides-dir dir] [--out dir]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
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
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonText = extractFirstJsonObject(trimmed);
    if (!jsonText) throw new Error("Model response did not contain a JSON object.");
    return JSON.parse(jsonText);
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function boundedNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
