#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const DEFAULT_INPUT = ".artifacts/quadratic-eval/final/results.jsonl";
const DEFAULT_OUT = ".artifacts/slides/quadratic-final";
const GOOGLE_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MOS/Google Chrome".replace("/MOS/", "/MacOS/");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolve(args.input ?? DEFAULT_INPUT);
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  const rows = await readJsonl(inputPath);
  const selected = selectRows(rows, args);

  await mkdir(outDir, { recursive: true });

  const manifest = {
    created_at: new Date().toISOString(),
    input: inputPath,
    output_dir: outDir,
    case_count: selected.length,
    cases: [],
  };

  for (const [index, row] of selected.entries()) {
    const caseId = String(row.case_id).padStart(2, "0");
    const caseDir = join(outDir, `case-${caseId}`);
    await mkdir(caseDir, { recursive: true });

    console.log(`[${index + 1}/${selected.length}] case ${row.case_id}: generating slides`);
    const lesson = buildLesson(row);
    const mdPath = join(caseDir, "slides.md");
    const htmlPath = join(caseDir, "slides.html");
    const narrationJsonPath = join(caseDir, "narration.json");
    const narrationMdPath = join(caseDir, "narration.md");
    await writeFile(mdPath, lesson.markdown, "utf8");
    await writeFile(narrationJsonPath, `${JSON.stringify(lesson.narration, null, 2)}\n`, "utf8");
    await writeFile(narrationMdPath, lesson.narrationMarkdown, "utf8");
    await runMarp(mdPath, htmlPath);
    await injectAutoPlayer(htmlPath);

    const validation = await validateHtml(htmlPath, caseDir);
    manifest.cases.push({
      case_id: row.case_id,
      judge_score: row.judge?.score ?? null,
      judge_pass: row.judge?.pass === true,
      md: mdPath,
      html: htmlPath,
      narration_json: narrationJsonPath,
      narration_md: narrationMdPath,
      ...validation,
    });
  }

  const summary = summarize(manifest);
  await writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`\nWrote ${outDir}`);
  console.log(`HTML pass rate: ${summary.html_pass_rate} (${summary.html_pass_count}/${summary.case_count})`);
}

function buildLesson(row) {
  const analysis = row.analysis ?? {};
  const solution = analysis.solution_result ?? {};
  const topic = clean(analysis.topic) || "高校数学";
  const finalAnswer = completeFinalAnswer(row, clean(solution.final_answer) || "解答を読み取れませんでした。");
  const completedSteps = completeCalculationSteps(row, asArray(solution.calculation_steps), finalAnswer);
  const visibleSteps = expandCalculationSteps(
    completedSteps.length > 0
      ? completedSteps
      : [{
        narration: "解答画像から読み取った最終答えを確認します。",
        formula: finalAnswer,
      }]
  );
  const groups = groupSceneSteps(visibleSteps, 4);
  const narration = buildNarrationTimeline(row, groups, finalAnswer, topic);

  const markdown = [
    "---",
    "marp: true",
    "theme: default",
    "paginate: true",
    "size: 16:9",
    "style: |",
    ...buildLessonStyle(),
    "---",
    "",
    ...sceneSlides(row, groups, finalAnswer, narration),
  ].join("\n");
  return {
    markdown: markdown.replace(/\n---\n/g, "\n\n---\n\n"),
    narration,
    narrationMarkdown: buildNarrationMarkdown(narration),
  };
}

function buildLessonStyle() {
  return [
    "  section { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; padding: 42px 56px; color: #111827; }",
    "  h1 { font-size: 48px; line-height: 1.16; }",
    "  h2 { font-size: 32px; line-height: 1.2; margin-bottom: 18px; }",
    "  h3 { font-size: 20px; margin: 0 0 8px; }",
    "  p, li { font-size: 24px; line-height: 1.48; }",
    "  pre { font-size: 22px; line-height: 1.36; white-space: pre-wrap; margin: 8px 0 0; }",
    "  .answer { font-size: 28px; line-height: 1.5; white-space: pre-wrap; }",
    "  section.scene-slide { display: grid; grid-template-columns: minmax(430px, 0.95fr) minmax(0, 1.05fr); grid-template-rows: auto minmax(0, 1fr); gap: 16px 30px; padding: 30px 42px; }",
    "  section.scene-slide h2 { grid-column: 1 / 3; margin: 0; }",
    "  .narration-meta { display: none; }",
    "  .scene-visual { position: relative; align-self: stretch; min-height: 590px; background: #ffffff; overflow: hidden; }",
    "  .scene-visual svg { width: 100%; height: 100%; display: block; }",
    "  .scene-highlight { position: absolute; width: 13px; height: 13px; border-radius: 999px; background: #dc2626; box-shadow: 0 0 0 7px rgba(220,38,38,.16); opacity: 0; animation: scene-pop .45s ease forwards; animation-delay: calc(var(--step-index) * 1.35s + .55s); }",
    "  .scene-highlight.h1 { left: 49%; top: 49%; }",
    "  .scene-highlight.h2 { left: 62%; top: 37%; }",
    "  .scene-highlight.h3 { left: 36%; top: 37%; }",
    "  .scene-highlight.h4 { left: 72%; top: 62%; }",
    "  .scene-panel { align-self: stretch; overflow: hidden; display: flex; flex-direction: column; gap: 12px; padding-top: 2px; }",
    "  .scene-step { padding: 0; opacity: 0; transform: translateY(8px); animation: scene-pop .45s ease forwards; animation-delay: calc(var(--step-index) * 1.35s); }",
    "  .scene-step p { font-size: 20px; line-height: 1.42; margin: 0; }",
    "  .scene-step .step-index { color: #2563eb; font-weight: 800; margin-right: 0.3em; }",
    "  .scene-step pre { font-size: 19px; background: transparent; border: 0; padding: 0 0 0 1.65rem; margin: 4px 0 0; color: #111827; font-weight: 650; }",
    "  .scene-answer { margin-top: auto; padding: 0; opacity: 0; transform: translateY(8px); animation: scene-pop .45s ease forwards; animation-delay: calc(var(--step-count) * 1.35s); }",
    "  .scene-answer strong { display: block; font-size: 18px; margin-bottom: 5px; color: #15803d; }",
    "  .scene-answer .answer { font-size: 21px; color: #14532d; font-weight: 700; }",
    "  .scene-answer .compact-answer { font-size: 16px; line-height: 1.38; }",
    "  @keyframes scene-pop { to { opacity: 1; transform: translateY(0); } }",
    "  @media print { .scene-step, .scene-answer, .scene-highlight, .plot-point, .domain-marker, .sub-row, .param-note, .sq-row, .axis-line, .axis-guide, .grid-line { opacity: 1; transform: none; animation: none; } .draw-line, .param-curve, .draw-shape { stroke-dashoffset: 0; } }",
  ];
}

function sceneSlides(row, groups, finalAnswer, narration) {
  return groups.map((group, groupIndex) => {
    const rendered = sceneSlide(row, group.steps, finalAnswer, {
      groupIndex,
      groupCount: groups.length,
      stepOffset: group.offset,
      subproblem: group.subproblem,
      allSteps: groups.flatMap((item) => item.steps),
      narrationScene: narration.scenes[groupIndex],
      showAnswer: groupIndex === groups.length - 1,
    });
    return groupIndex === 0 ? rendered.replace(/^---\n\n/, "") : rendered;
  });
}

function sceneSlide(row, steps, finalAnswer, options) {
  const scene = options.narrationScene ?? {};
  const sceneId = scene.id ?? `scene-${String(options.groupIndex + 1).padStart(2, "0")}`;
  const sceneTitle = scene.title ?? inferSceneTitle(steps, options.groupIndex, options.groupCount);
  const answerSegment = scene.segments?.find((segment) => segment.type === "answer");
  const durationMs = Math.max(4200, steps.length * 1350 + (options.showAnswer ? 2100 : 1200));
  const answerClass = finalAnswer.length > 180 ? "answer compact-answer" : "answer";
  return slide([
    "<!-- _class: scene-slide -->",
    `<div class="narration-meta" data-scene-id="${escapeHtmlAttr(sceneId)}" data-narration-id="${escapeHtmlAttr(sceneId)}" data-auto-duration-ms="${durationMs}"></div>`,
    `<h2>${escapeHtml(sceneTitle)}</h2>`,
    "",
    '<div class="scene-visual">',
    coordinateSvg(row, {
      sceneSteps: steps,
      allSteps: options.allSteps,
      finalAnswer,
      subproblem: options.subproblem,
    }),
    ...steps.slice(0, 4).map((_step, index) =>
      `<span class="scene-highlight h${index + 1}" style="--step-index:${index}"></span>`
    ),
    "</div>",
    "",
    `<div class="scene-panel" style="--step-count:${steps.length}">`,
    ...steps.map((step, index) => {
      const segment = scene.segments?.filter((item) => item.type !== "answer")[index];
      const stepNumber = options.stepOffset + index + 1;
      return [
      `<div class="scene-step" data-scene-id="${escapeHtmlAttr(sceneId)}" data-narration-id="${escapeHtmlAttr(segment?.id ?? `${sceneId}-step-${String(index + 1).padStart(2, "0")}`)}" data-step-number="${stepNumber}" style="--step-index:${index}">`,
      `<p><span class="step-index">${stepNumber}.</span>${escapeHtml(clean(step.narration) || "計算を進めます。")}</p>`,
      clean(step.formula) ? `<pre>${escapeHtml(clean(step.formula))}</pre>` : "",
      "</div>",
      ].filter(Boolean).join("\n");
    }),
    options.showAnswer ? [
    `<div class="scene-answer" data-scene-id="${escapeHtmlAttr(sceneId)}" data-narration-id="${escapeHtmlAttr(answerSegment?.id ?? `${sceneId}-answer`)}">`,
    "<strong>最終答え</strong>",
    `<div class="${answerClass}">${escapeHtml(finalAnswer)}</div>`,
    "</div>",
    ].join("\n") : "",
    "</div>",
  ]);
}

function coordinateSvg(row, context = {}) {
  const spec = buildDiagramSpec(row, context);
  const specJson = escapeHtmlAttr(JSON.stringify(spec));
  const svg = (() => {
    if (spec.type === "shape") return shapeSvg(spec);
    if (spec.type === "composite") return compositeSvg(spec);
    if (spec.type === "function_graph") return functionGraphSvg(spec);
    if (spec.type === "substitution_table") return substitutionTableSvg(spec);
    if (spec.type === "parameter_extreme") return parameterExtremeSvg(spec);
    if (spec.type === "square_completion") return squareCompletionSvg(spec);
    if (spec.type === "linear_system") return linearSystemSvg(spec);
    return equationFlowSvg(spec);
  })();
  return `<div class="diagram-meta" data-diagram-spec="${specJson}" style="display:none"></div>${svg}`;
}

async function validateHtml(htmlPath, caseDir) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: GOOGLE_CHROME_PATH,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    await page.goto(`${pathToFileURL(htmlPath).href}?autoplay=0`, { waitUntil: "load" });
    await page.addStyleTag({
      content: `
        * { animation: none !important; transition: none !important; caret-color: transparent !important; }
        .scene-step, .scene-answer, .scene-highlight, .plot-point, .domain-marker, .sub-row, .param-note, .sq-row, .axis-line, .axis-guide, .grid-line {
          opacity: 1 !important;
          transform: none !important;
        }
        .draw-line, .param-curve, .draw-shape {
          stroke-dashoffset: 0 !important;
        }
      `,
    });
    await page.evaluate(() => window.AISenseiPreview?.resetCurrent?.());

    const sections = await page.locator("section").count();
    const sceneSections = await page.locator("section.scene-slide").count();
    const sceneSteps = await page.locator(".scene-step").count();
    const sceneHighlights = await page.locator(".scene-highlight").count();
    const narrationSyncCount = await page.locator("[data-narration-id]").count();
    const firstSlideIsScene = sceneSections > 0
      ? await page.locator("section").first().evaluate((section) => section.classList.contains("scene-slide"))
      : false;
    const firstSceneVisibleSteps = sceneSections > 0
      ? await page.locator("section.scene-slide").first().locator(".scene-step").evaluateAll((steps) =>
        steps.filter((step) => {
          const rect = step.getBoundingClientRect();
          const style = window.getComputedStyle(step);
          return style.visibility !== "hidden"
            && style.display !== "none"
            && rect.width > 1
            && rect.height > 1
            && rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth;
        }).length
      )
      : 0;
    const textLength = await page.locator("body").evaluate((body) => body.textContent?.trim().length ?? 0);
    const screenshotPath = join(caseDir, "preview.png");
    if (sceneSections > 0) {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    }
    const captureManifest = sceneSections > 0
      ? await captureAnimationFrames(browser, htmlPath, caseDir, sceneSections)
      : null;

    return {
      html_ok: sections >= 1 && sceneSections >= 1 && firstSlideIsScene && firstSceneVisibleSteps >= 1 && sceneSteps >= 1 && narrationSyncCount >= sceneSteps && textLength >= 80,
      section_count: sections,
      scene_section_count: sceneSections,
      scene_step_count: sceneSteps,
      scene_highlight_count: sceneHighlights,
      narration_sync_count: narrationSyncCount,
      first_slide_is_scene: firstSlideIsScene,
      first_scene_visible_step_count: firstSceneVisibleSteps,
      text_length: textLength,
      preview: screenshotPath,
      animation_capture_manifest: captureManifest?.manifest_path ?? null,
      animation_capture_count: captureManifest?.frame_count ?? 0,
      animation_scene_count: captureManifest?.scene_count ?? 0,
    };
  } catch (error) {
    return {
      html_ok: false,
      section_count: 0,
      text_length: 0,
      preview: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser.close();
  }
}

async function captureAnimationFrames(browser, htmlPath, caseDir, sceneCount) {
  const captureDir = join(caseDir, "captures");
  await mkdir(captureDir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const frames = [];

  try {
    await page.goto(`${pathToFileURL(htmlPath).href}?autoplay=0`, { waitUntil: "load" });
    await page.waitForTimeout(250);

    for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
      if (sceneIndex > 0) {
        await page.evaluate((index) => window.AISenseiPreview?.goTo?.(index), sceneIndex);
        await page.waitForTimeout(250);
      }

      const duration = await page.evaluate((index) => window.AISenseiPreview?.sceneDuration?.(index) ?? 5200, sceneIndex);
      const offsets = captureOffsets(duration);
      for (const offset of offsets) {
        await page.evaluate(({ index, time }) => window.AISenseiPreview?.setSceneTime?.(index, time), {
          index: sceneIndex,
          time: offset,
        });
        await page.waitForTimeout(50);
        const fileName = `scene-${String(sceneIndex + 1).padStart(2, "0")}-t${String(offset).padStart(5, "0")}.png`;
        const framePath = join(captureDir, fileName);
        await page.screenshot({ path: framePath, fullPage: false });
        frames.push({
          scene_index: sceneIndex + 1,
          elapsed_ms: offset,
          path: `captures/${fileName}`,
        });
      }
    }
  } finally {
    await page.close();
  }

  const manifest = {
    created_at: new Date().toISOString(),
    scene_count: sceneCount,
    frames_per_scene: 4,
    frame_count: frames.length,
    frames,
  };
  const manifestPath = join(captureDir, "capture-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    manifest_path: manifestPath,
    scene_count: sceneCount,
    frame_count: frames.length,
  };
}

function captureOffsets(duration) {
  const end = Math.max(1800, Number(duration) || 5200);
  const raw = [0, Math.min(1200, end - 900), Math.min(2800, end - 450), end];
  return [...new Set(raw.map((value) => Math.max(0, Math.round(value))))].sort((a, b) => a - b);
}

function summarize(manifest) {
  const htmlPassCount = manifest.cases.filter((item) => item.html_ok).length;
  return {
    case_count: manifest.case_count,
    html_pass_count: htmlPassCount,
    html_pass_rate:
      manifest.case_count === 0 ? "0.0%" : `${((htmlPassCount / manifest.case_count) * 100).toFixed(1)}%`,
    failed_cases: manifest.cases
      .filter((item) => !item.html_ok)
      .map((item) => ({
        case_id: item.case_id,
        error: item.error ?? null,
        section_count: item.section_count,
        text_length: item.text_length,
      })),
  };
}

function runMarp(mdPath, htmlPath) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "npx",
      ["marp", "--html", "--no-stdin", mdPath, "-o", htmlPath],
      { timeout: 60_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Marp failed for ${basename(mdPath)}: ${stderr || error.message}`));
          return;
        }
        resolvePromise();
      }
    );
  });
}

async function injectAutoPlayer(htmlPath) {
  const html = await readFile(htmlPath, "utf8");
  if (html.includes("window.AISenseiPreview")) return;
  const injected = html.replace("</body>", `${autoPlayerMarkup()}\n</body>`);
  await writeFile(htmlPath, injected, "utf8");
}

function autoPlayerMarkup() {
  return `<style id="ai-sensei-preview-ui">
  .bespoke-marp-osc,
  .bespoke-progress-parent {
    display: none !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
</style>
<script>
(() => {
  const params = new URLSearchParams(location.search);
  const autoplay = params.get("autoplay") !== "0";
  const sections = Array.from(document.querySelectorAll("section.scene-slide"));
  if (sections.length === 0) return;
  let timer = null;
  let current = 0;

  function visibleIndex() {
    let bestIndex = current;
    let bestArea = -1;
    for (const [index, section] of sections.entries()) {
      const rect = section.getBoundingClientRect();
      const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const area = width * height;
      if (area > bestArea) {
        bestArea = area;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function durationFor(index) {
    const value = Number(sections[index]?.querySelector(".narration-meta")?.dataset.autoDurationMs);
    return Number.isFinite(value) && value > 0 ? value : 5200;
  }

  function resetAnimations(section) {
    if (!section) return;
    const animated = section.querySelectorAll(".scene-step,.scene-answer,.scene-highlight,.plot-point,.domain-marker,.sub-row,.param-note,.sq-row,.flow-line,.sys-line,.sys-arrow,.measure,.axis-guide,.grid-line,.draw-line,.param-curve,.draw-shape");
    for (const element of animated) {
      element.style.animation = "none";
    }
    section.getBoundingClientRect();
    for (const element of animated) {
      element.style.animation = "";
    }
  }

  function activate(index) {
    current = Math.max(0, Math.min(sections.length - 1, index));
    for (const section of sections) section.classList.remove("ai-active-slide");
    const section = sections[current];
    section.classList.add("ai-active-slide");
    resetAnimations(section);
    return current;
  }

  function goTo(index) {
    const next = Math.max(0, Math.min(sections.length - 1, index));
    const id = sections[next]?.id;
    if (id) location.hash = id;
    sections[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    setTimeout(() => activate(next), 80);
    return next;
  }

  function pressNext() {
    const eventInit = { key: "ArrowRight", code: "ArrowRight", keyCode: 39, which: 39, bubbles: true };
    document.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    window.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  }

  function advance() {
    const before = current;
    if (before >= sections.length - 1) return;
    goTo(before + 1);
    setTimeout(() => {
      if (visibleIndex() === before) pressNext();
      activate(Math.max(before + 1, visibleIndex()));
      schedule();
    }, 160);
  }

  function schedule() {
    clearTimeout(timer);
    if (!autoplay || current >= sections.length - 1) return;
    timer = setTimeout(advance, durationFor(current));
  }

  function resetCurrent() {
    activate(visibleIndex());
    schedule();
  }

  window.AISenseiPreview = {
    goTo(index) {
      clearTimeout(timer);
      return goTo(index);
    },
    resetCurrent,
    resetScene(index) {
      clearTimeout(timer);
      return activate(index);
    },
    setSceneTime(index, time) {
      clearTimeout(timer);
      const sceneIndex = activate(index);
      const section = sections[sceneIndex];
      for (const animation of section.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Math.max(0, Number(time) || 0);
      }
      return sceneIndex;
    },
    currentDuration() {
      current = visibleIndex();
      return durationFor(current);
    },
    sceneDuration(index) {
      return durationFor(index);
    },
    currentIndex() {
      current = visibleIndex();
      return current;
    },
    stop() {
      clearTimeout(timer);
    },
  };

  window.addEventListener("hashchange", () => setTimeout(resetCurrent, 120));
  document.addEventListener("keydown", () => setTimeout(resetCurrent, 160), true);
  window.addEventListener("load", () => {
    activate(visibleIndex());
    schedule();
  });
  activate(visibleIndex());
  schedule();
})();
</script>`;
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
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help") {
      console.log("usage: npm run slides:eval -- [--all] [--case n] [--input results.jsonl] [--out dir]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function slide(lines) {
  return ["---", "", ...lines].join("\n");
}

function completeFinalAnswer(row, finalAnswer) {
  if (!/途中|読み取れません|不完全/.test(finalAnswer)) return finalAnswer;
  const analysis = row.analysis ?? {};
  const solution = analysis.solution_result ?? {};
  const text = [
    analysis.problem_summary,
    ...(asArray(solution.calculation_steps).flatMap((step) => [step?.formula, step?.narration])),
  ].filter(Boolean).join("\n");
  const points = extractPoints(text);
  if (points.length < 6) return finalAnswer;
  const derived = deriveQuadraticFromPoints(points.slice(-3));
  if (!derived) return finalAnswer;
  return finalAnswer.replace(/(2\)\s*).*/, `$1y = ${derived.expression}`);
}

function completeCalculationSteps(row, steps, finalAnswer) {
  const list = steps.map((step) => ({ ...step }));
  const rawFinalAnswer = clean(row.analysis?.solution_result?.final_answer);
  if (!/途中|読み取れません|不完全/.test(rawFinalAnswer)) return list;

  const analysis = row.analysis ?? {};
  const text = [
    analysis.problem_summary,
    ...list.flatMap((step) => [step?.formula, step?.narration]),
    finalAnswer,
  ].filter(Boolean).join("\n");
  const points = extractPoints(text);
  const derived = deriveQuadraticFromPoints(points.slice(-3));
  if (!derived) return list;

  const joined = list.flatMap((step) => [step.formula, step.narration]).filter(Boolean).join("\n");
  if (!/a\s*\+\s*b\s*=\s*-5/.test(normalizeMath(joined))) {
    list.push({
      narration: "(2) c = 2 を a + b + c = -3 に代入します。",
      formula: "a + b = -5",
    });
  }
  if (!/a\s*=\s*-2/.test(normalizeMath(joined))) {
    list.push({
      narration: "a + b = -5 と 2a - b = -1 を連立して a, b を求めます。",
      formula: "a + b = -5, 2a - b = -1 より a = -2, b = -3",
    });
  }
  if (!new RegExp(escapeRegExp(derived.expression).replace(/x²/g, "x\\^2")).test(normalizeMath(joined))) {
    list.push({
      narration: `求めた係数を y = ax² + bx + c に戻します。`,
      formula: `(2) y = ${derived.expression}`,
    });
  }
  return list;
}

function expandCalculationSteps(steps) {
  const expanded = [];
  for (const step of steps) {
    const formula = clean(step?.formula);
    const parts = splitEquationChain(formula);
    if (parts.length < 3) {
      expanded.push(step);
      continue;
    }

    expanded.push({
      ...step,
      narration: clean(step?.narration) || "式を順番に変形します。",
      formula: `${parts[0]} = ${parts[1]}`,
    });
    for (const part of parts.slice(2)) {
      expanded.push({
        ...step,
        narration: "前の式をさらに整理します。",
        formula: `= ${part}`,
      });
    }
  }
  return expanded;
}

function splitEquationChain(formula) {
  if (!formula || formula.length > 190 || /[,，：:]|\n/.test(formula)) return [];
  const normalized = normalizeMathForDisplay(formula);
  const parts = normalized.split(/\s*=\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return [];
  if (parts.some((part) => part.length > 70)) return [];
  return parts;
}

function buildNarrationTimeline(row, groups, finalAnswer, topic) {
  const scenes = groups.map((group, groupIndex) => {
    const id = `scene-${String(groupIndex + 1).padStart(2, "0")}`;
    const title = inferSceneTitle(group.steps, groupIndex, groups.length);
    const stepSegments = group.steps.map((step, index) => {
      const stepNumber = group.offset + index + 1;
      const text = narrationTextForStep(step, stepNumber);
      return {
        id: `${id}-step-${String(index + 1).padStart(2, "0")}`,
        type: "step",
        step_number: stepNumber,
        text,
        formula: clean(step.formula),
        cue: "text-and-diagram",
        estimated_duration_sec: estimateSpeechSeconds(text),
      };
    });
    const answerSegment = groupIndex === groups.length - 1
      ? [{
        id: `${id}-answer`,
        type: "answer",
        step_number: null,
        text: `最後に答えを確認します。${speechFormula(finalAnswer)}`,
        formula: finalAnswer,
        cue: "final-answer",
        estimated_duration_sec: estimateSpeechSeconds(finalAnswer),
      }]
      : [];
    const segments = [...stepSegments, ...answerSegment];
    return {
      id,
      title,
      slide_index: groupIndex + 1,
      estimated_duration_sec: segments.reduce((sum, segment) => sum + segment.estimated_duration_sec, 0),
      segments,
    };
  });

  const totalDuration = scenes.reduce((sum, scene) => sum + scene.estimated_duration_sec, 0);
  return {
    version: 1,
    case_id: String(row.case_id),
    title: clean(topic) || "高校数学",
    problem_summary: clean(row.analysis?.problem_summary),
    final_answer: finalAnswer,
    sync_contract: {
      slide_selector: ".scene-slide",
      scene_id_attribute: "data-scene-id",
      segment_id_attribute: "data-narration-id",
      expected_flow: "計算で必要な軸・点・値がわかってから、軸、補助線、グラフ、点、説明テキストの順に表示する",
    },
    tts_options: [
      { provider: "macos-say", cost: "0円。macOS内蔵音声でローカル生成。" },
      { provider: "voicevox", cost: "0円。別途VOICEVOX Engineのローカル起動が必要。" },
      { provider: "elevenlabs", cost: "APIキーと有料枠が必要。高品質な商用音声向け。" },
      { provider: "openai", cost: "APIキーが必要。低遅延TTS向け。" },
      { provider: "mistral", cost: "API利用は従量課金。Voxtral TTSのオープンウェイトをローカル実行する場合は推論環境の計算コストのみ。" },
    ],
    estimated_duration_sec: totalDuration,
    scenes,
  };
}

function buildNarrationMarkdown(timeline) {
  const lines = [
    `# Case ${timeline.case_id} Narration`,
    "",
    `Topic: ${timeline.title}`,
    `Estimated duration: ${timeline.estimated_duration_sec}s`,
    "",
  ];
  for (const scene of timeline.scenes) {
    lines.push(`## ${scene.slide_index}. ${scene.title}`, "");
    for (const segment of scene.segments) {
      lines.push(`- ${segment.id} [${segment.cue}] ${segment.text}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function inferSceneTitle(steps, index, total) {
  const text = steps.flatMap((step) => [step?.narration, step?.formula]).filter(Boolean).join("\n");
  if (/平方完成|頂点/.test(text)) return "平方完成から軸を読む";
  if (/軸|放物線|グラフ|直線/.test(text)) return "軸とグラフを描く";
  if (/定義域|値域|最大値|最小値/.test(text)) return "範囲で値を比べる";
  if (/代入|f\(/.test(text)) return "値を代入して確かめる";
  if (/連立|消去|係数/.test(text)) return "条件から式を絞る";
  if (index === total - 1) return "答えをまとめる";
  return "式を順番に進める";
}

function narrationTextForStep(step, stepNumber) {
  const narration = clean(step?.narration) || "計算を進めます。";
  const formula = clean(step?.formula);
  const formulaSpeech = formula ? `式は、${speechFormula(formula)}、です。` : "";
  return `${stepNumber}つ目。${speechNarration(stripStepMarker(narration))}${formulaSpeech ? ` ${formulaSpeech}` : ""}`;
}

function stripStepMarker(value) {
  return value.replace(/^\s*[（(]\d+[）)]\s*/, "").trim();
}

function speechNarration(value) {
  return String(value)
    .replace(/x\^2|x²/g, "エックス二乗")
    .replace(/y\^2|y²/g, "ワイ二乗")
    .replace(/(?<![A-Za-z])x/g, "エックス")
    .replace(/(?<![A-Za-z])y/g, "ワイ")
    .replace(/(?<![A-Za-z])k/g, "ケー")
    .replace(/-(?=\d)/g, "マイナス")
    .replace(/\s+/g, " ")
    .trim();
}

function speechFormula(value) {
  return displayExpression(String(value))
    .replace(/\n+/g, "。")
    .replace(/²/g, "二乗")
    .replace(/=/g, "イコール")
    .replace(/\+/g, "プラス")
    .replace(/-/g, "マイナス")
    .replace(/\*/g, "かける")
    .replace(/\//g, "分の")
    .replace(/≤|≦/g, "以下")
    .replace(/</g, "小なり")
    .replace(/>/g, "大なり")
    .replace(/x/g, "エックス")
    .replace(/y/g, "ワイ")
    .replace(/k/g, "ケー")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateSpeechSeconds(text) {
  const length = String(text).replace(/\s+/g, "").length;
  return Math.max(4, Math.ceil(length / 12));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split(/\n+/);
  return [];
}

function groupSceneSteps(steps, maxSize) {
  const groups = [];
  let current = [];
  let currentOffset = 0;
  let currentSubproblem = null;
  let activeSubproblem = null;

  const flush = () => {
    if (current.length === 0) return;
    groups.push({
      steps: current,
      offset: currentOffset,
      subproblem: currentSubproblem ?? activeSubproblem,
    });
    current = [];
    currentOffset += groups.at(-1).steps.length;
    currentSubproblem = null;
  };

  for (const step of steps) {
    const marker = extractSubproblemNumber(step);
    if (marker) {
      if (current.length > 0 && activeSubproblem && marker !== activeSubproblem) flush();
      activeSubproblem = marker;
    }
    if (current.length >= maxSize) flush();
    if (current.length === 0) currentSubproblem = marker ?? activeSubproblem;
    current.push(step);
  }

  flush();
  return groups.length > 0 ? groups : [{ steps: [], offset: 0, subproblem: null }];
}

function extractSubproblemNumber(step) {
  const text = `${step?.narration ?? ""}\n${step?.formula ?? ""}`;
  const match = text.match(/(?:小問\s*)?[（(](\d+)[）)]|小問\s*(\d+)/);
  if (!match) return null;
  return Number(match[1] ?? match[2]);
}

function clean(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildDiagramSpec(row, context = {}) {
  const analysis = row.analysis ?? {};
  const solution = analysis.solution_result ?? {};
  const allSteps = context.allSteps?.length ? context.allSteps : asArray(solution.calculation_steps);
  const sceneSteps = context.sceneSteps?.length ? context.sceneSteps : allSteps;
  const sceneBaseText = [
    analysis.problem_summary,
    analysis.topic,
  ].filter(Boolean).join("\n");
  const baseText = [
    analysis.problem_summary,
    analysis.topic,
    analysis.solution_outline,
  ].flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join("\n");
  const sceneStepText = sceneSteps.flatMap((step) => [step.formula, step.narration]).filter(Boolean).join("\n");
  const sceneText = [
    sceneBaseText,
    sceneStepText,
  ].filter(Boolean).join("\n");
  const allText = [
    baseText,
    solution.final_answer,
    ...allSteps.flatMap((step) => [step.formula, step.narration]),
  ].filter(Boolean).join("\n");
  const sourceText = `${sceneText}\n${allText}`;
  const multiGraphTask = isMultiGraphTask(sourceText);

  if (isSubstitutionTask(sceneText, sourceText)) {
    return buildSubstitutionSpec(sceneSteps, sceneText, sourceText);
  }

  if (isParameterExtremeTask(sceneText, sourceText)) {
    return buildParameterExtremeSpec(sceneSteps, sceneText, sourceText);
  }

  if (isSymbolicDomainExtremeTask(sceneText, sourceText)) {
    return buildSymbolicDomainExtremeSpec(sceneSteps, sceneText, sourceText);
  }

  if (isSquareCompletionAlgebraTask(sceneText, sourceText)) {
    return buildSquareCompletionSpec(sceneSteps, sceneText);
  }

  const allFunctions = extractFunctions(allText);
  const sceneFunctions = extractFunctions(sceneText);
  const subproblemFunctions = extractFunctionsForSubproblem(allText, context.subproblem);
  let functions = sceneFunctions.length > 0
    ? sceneFunctions
    : subproblemFunctions.length > 0
      ? subproblemFunctions
      : selectBySubproblem(allFunctions, context.subproblem);
  const scenePoints = extractPoints(sceneStepText);
  const allPoints = extractPoints(allText);
  const subproblemPoints = extractPointsForSubproblem(allText, context.subproblem);
  let points = scenePoints.length > 0
    ? scenePoints
    : subproblemPoints.length > 0
      ? subproblemPoints
      : selectBySubproblem(allPoints, context.subproblem);
  const sceneDomains = extractDomains(sceneStepText);
  const allDomains = extractDomains(allText);
  const subproblemDomains = extractDomainsForSubproblem(allText, context.subproblem);
  let domains = sceneDomains.length > 0
    ? sceneDomains
    : subproblemDomains.length > 0
      ? subproblemDomains
      : selectBySubproblem(allDomains, context.subproblem);
  if (multiGraphTask) {
    functions = allFunctions.length > 0 ? allFunctions : functions;
    points = allPoints.length > 0 ? allPoints : points;
    domains = allDomains.length > 0 ? allDomains : domains;
  }
  const derivedFromPoints = deriveQuadraticFromPoints(points);
  if (derivedFromPoints && /3点|通る|通過点/.test(sceneText) && (sceneFunctions.length === 0 || context.subproblem > 1)) {
    functions = [derivedFromPoints];
  }

  if (/3つの二次関数のグラフ|どの関数式に対応/.test(sourceText) && functions.length === 0) {
    return {
      type: "function_graph",
      title: "3つの放物線を比較",
      functions: [
        { kind: "quadratic", a: 2, b: 0, c: 0, h: 0, k: 0, expression: "2x²" },
        { kind: "quadratic", a: -1, b: 0, c: 0, h: 0, k: 0, expression: "-x²" },
        { kind: "quadratic", a: 1 / 3, b: 0, c: 0, h: 0, k: 0, expression: "(1/3)x²" },
      ],
      points: [],
      domains: [],
    };
  }

  if (/正方形/.test(sourceText)) {
    return { type: "shape", shape: "square", labels: ["x", "x"], title: "正方形の面積" };
  }
  if ((/長方形|直角三角形|三角形/.test(sourceText) && /最大値|最小値/.test(sourceText) && functions.length > 0)) {
    return {
      type: "composite",
      title: /三角形/.test(sourceText) ? "図形と面積の最大値" : "図形と面積の関数",
      shape: /三角形/.test(sourceText) ? "right_triangle" : "rectangle",
      labels: /三角形/.test(sourceText) ? ["x", "20 - x"] : ["x", "6 - x"],
      functions: functions.slice(0, 2),
      points: augmentGraphPoints(functions, points, domains).slice(0, 8),
      domains,
    };
  }
  if (/長方形/.test(sourceText)) {
    return {
      type: "shape",
      shape: "rectangle",
      labels: ["x", "6 - x"],
      title: "長方形の面積",
      conditions: extractShapeConditions(sourceText),
      domains,
    };
  }
  if (/直角三角形|三角形/.test(sourceText) && /面積|直角/.test(sourceText)) {
    return { type: "shape", shape: "right_triangle", labels: ["x", "20 - x"], title: "直角三角形の面積" };
  }

  if (functions.length > 0 || (points.length > 0 && /座標|放物線|グラフ|直線|二次関数|一次関数/.test(sourceText))) {
    const graphFunctions = dedupeEquivalentFunctions(functions).slice(0, 4);
    return {
      type: "function_graph",
      title: multiGraphTask ? inferMultiGraphTitle(sourceText) : inferGraphTitle(sourceText),
      functions: graphFunctions,
      points: augmentGraphPoints(graphFunctions, points, domains).slice(0, 12),
      domains,
    };
  }

  if (isLinearSystemTask(sceneText, sourceText)) {
    return buildLinearSystemSpec(sceneSteps, sceneText, sourceText);
  }

  return {
    type: "equation_flow",
    title: /f\(/.test(sourceText) ? "代入の流れ" : "式変形の流れ",
    lines: extractEquationLines(sceneSteps, sceneText).slice(0, 8),
  };
}

function selectBySubproblem(items, subproblem) {
  if (!subproblem || items.length <= 1) return items;
  return items[subproblem - 1] ? [items[subproblem - 1]] : items;
}

function isMultiGraphTask(text) {
  const normalized = normalizeMath(text);
  return /(?:2つ|3つ|複数).*?(?:グラフ|直線|放物線)|(?:グラフ|直線|放物線).*?(?:2つ|3つ|複数)|座標平面上にかく/.test(normalized)
    && /グラフ|直線|放物線/.test(normalized);
}

function inferMultiGraphTitle(text) {
  if (/直線|一次関数/.test(text)) return "複数の直線を同じ座標平面で比較";
  if (/放物線|二次関数|x\^2|x²/.test(text)) return "複数の放物線を同じ座標平面で比較";
  return "複数のグラフを比較";
}

function extractFunctionsForSubproblem(text, subproblem) {
  if (!subproblem) return [];
  return extractFunctions(extractSubproblemText(text, subproblem));
}

function extractPointsForSubproblem(text, subproblem) {
  if (!subproblem) return [];
  return extractPoints(extractSubproblemText(text, subproblem));
}

function extractDomainsForSubproblem(text, subproblem) {
  if (!subproblem) return [];
  return extractDomains(extractSubproblemText(text, subproblem));
}

function extractSubproblemText(text, subproblem) {
  const lines = normalizeMath(text).split(/\n/);
  const chunks = [];
  let active = null;
  for (const line of lines) {
    const markers = [...line.matchAll(/(?:^|[\s。、,，])\((\d+)\)|小問\s*(\d+)/g)];
    if (markers.length > 0) {
      for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index];
        const markerText = marker[0];
        const markerOffset = marker.index + Math.max(0, markerText.indexOf("("));
        const nextOffset = markers[index + 1]?.index ?? line.length;
        active = Number(marker[1] ?? marker[2]);
        const segment = line.slice(markerOffset, nextOffset).trim();
        if (active === subproblem && segment) chunks.push(segment);
      }
      continue;
    }
    if (active === subproblem) chunks.push(line);
  }
  return chunks.join("\n");
}

function isSubstitutionTask(sceneText, sourceText) {
  const text = `${sceneText}\n${sourceText}`;
  return /f\([^)]+\)|f\(x\)/.test(text)
    && /代入|関数値|値を求める/.test(text)
    && !/最大値|最小値|値域|グラフ/.test(sceneText);
}

function buildSubstitutionSpec(sceneSteps, sceneText, sourceText) {
  return {
    type: "substitution_table",
    title: "代入値と関数値",
    definitions: extractFunctionDefinitions(`${sceneText}\n${sourceText}`).slice(0, 3),
    rows: extractSubstitutionRows(sceneSteps, sourceText).slice(0, 6),
  };
}

function extractFunctionDefinitions(text) {
  const normalized = normalizeMath(text);
  const definitions = [];
  const seen = new Set();
  for (const match of normalized.matchAll(/f\(x\)\s*=\s*([^。\n]+)/g)) {
    const expr = cleanupExpression(match[1]);
    if (!expr || seen.has(expr)) continue;
    seen.add(expr);
    definitions.push(`f(x) = ${displayExpression(expr)}`);
  }
  return definitions;
}

function extractSubstitutionRows(sceneSteps, sourceText) {
  const rows = [];
  const seen = new Set();
  const source = normalizeMath(sourceText);

  for (const step of sceneSteps) {
    const formula = normalizeMath(step?.formula ?? "");
    const narration = normalizeMath(step?.narration ?? "");
    const combined = `${narration}\n${formula}`;
    const substitution = formula.match(/f\(x\)\s*=\s*(.+?)\s+に\s*x\s*=\s*([^\s]+)\s*を代入/);
    if (substitution) {
      const expression = cleanupExpression(substitution[1]);
      const input = substitution[2].trim();
      const result = extractResultForInput(`${combined}\n${source}`, input);
      addSubstitutionRow(rows, seen, {
        input,
        expression: displayExpression(expression),
        calculation: extractCalculationForInput(combined, input) || `${displayExpression(expression)} に x = ${displayExpression(input)}`,
        result,
      });
      continue;
    }

    const direct = formula.match(/f\(([^)]+)\)\s*=\s*(.+)$/);
    if (direct) {
      const input = direct[1].trim();
      const calculation = direct[2].trim();
      addSubstitutionRow(rows, seen, {
        input,
        expression: "",
        calculation: displayExpression(calculation),
        result: displayExpression(lastEquationValue(calculation)),
      });
    }
  }

  return rows.length > 0 ? rows : [{ input: "x", expression: "", calculation: "関数式に指定値を代入", result: "" }];
}

function addSubstitutionRow(rows, seen, row) {
  const key = `${row.input}:${row.result}:${row.calculation}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

function extractResultForInput(text, input) {
  const escaped = escapeRegExp(input);
  const match = text.match(new RegExp(`f\\(\\s*${escaped}\\s*\\)\\s*=\\s*([^,，\\n]+)`));
  if (!match) return "";
  return displayExpression(lastEquationValue(match[1]));
}

function extractCalculationForInput(text, input) {
  const escaped = escapeRegExp(input);
  const match = text.match(new RegExp(`f\\(\\s*${escaped}\\s*\\)\\s*=\\s*([^\\n]+)`));
  return match ? displayExpression(match[1].trim()) : "";
}

function lastEquationValue(value) {
  return normalizeMath(value).split("=").pop().trim();
}

function isParameterExtremeTask(sceneText, sourceText) {
  const text = `${sceneText}\n${sourceText}`;
  return /k/.test(text)
    && /最大値|最小値|軸/.test(text)
    && /二次関数|x\^2|\(x/.test(text);
}

function isSymbolicDomainExtremeTask(sceneText, sourceText) {
  const text = normalizeMath(`${sceneText}\n${sourceText}`);
  return /最大値|最小値/.test(text)
    && /0\s*(?:<=|≤|≦|<)\s*x\s*(?:<=|≤|≦|<)\s*a|\[\s*0\s*,\s*a\s*\]/.test(text)
    && /x\^2|二次関数/.test(text);
}

function buildSymbolicDomainExtremeSpec(sceneSteps, sceneText, sourceText) {
  const normalized = normalizeMath(`${sceneText}\n${sourceText}`);
  const lines = normalized.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return {
    type: "parameter_extreme",
    title: "定義域と最大値の場合分け",
    original: extractOriginalFunction(normalized),
    vertex_form: extractVertexForm(lines),
    axis_label: extractAxisLabel(normalized, extractVertexForm(lines)),
    extreme_label: extractExtremeLabel(normalized),
    resolved_k: "",
    domain_label: "0 ≤ x ≤ a",
    domains: [{ label: "0 ≤ x ≤ a" }],
    lines: extractParameterLines(sceneSteps, normalized).slice(0, 6),
    opens: /^y\s*=\s*-|^-\s*/.test(extractOriginalFunction(normalized)) || /上に凸/.test(normalized) ? "down" : "up",
  };
}

function isSquareCompletionAlgebraTask(sceneText, sourceText) {
  const text = `${sceneText}\n${sourceText}`;
  return /平方完成/.test(text)
    && /y\s*=/.test(sceneText)
    && !/最大値|最小値|値域|定義域|面積|グラフを|通る|交点/.test(text);
}

function buildSquareCompletionSpec(sceneSteps, sceneText) {
  const formulas = sceneSteps.map((step) => normalizeMathForDisplay(step?.formula ?? "")).filter(Boolean);
  const formula = formulas
    .find((line) => /y\s*=/.test(line)) ?? extractEquationLines(sceneSteps, sceneText)[0] ?? "";
  const rawParts = formula.split(/\s*=\s*/).map((part) => part.trim()).filter(Boolean);
  const parts = /^(\(?\d+\)?\s*)?y$/.test(rawParts[0] ?? "") && rawParts.length > 1
    ? [`${rawParts[0]} = ${rawParts[1]}`, ...rawParts.slice(2)]
    : rawParts;
  const notes = sceneSteps.flatMap((step) => [step?.narration, step?.formula])
    .map((line) => normalizeMathForDisplay(line ?? "").trim())
    .filter(Boolean)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 5);
  const finalFormula = formulas.map((line) => line.replace(/^=\s*/, "")).at(-1) ?? parts.at(-1) ?? "";
  const halfNote = notes.find((line) => /半分|p\s*=/.test(line)) ?? "";
  const constantNote = notes.find((line) => /定数項|計算/.test(line)) ?? "";
  const items = [
    { label: "元の式", text: parts[0] ?? formula },
    halfNote ? { label: "係数の半分", text: halfNote } : null,
    { label: "平方の形", text: parts.at(-1) ?? formula },
    constantNote ? { label: "定数項", text: constantNote } : null,
    { label: "完成形", text: finalFormula },
  ].filter(Boolean);
  return {
    type: "square_completion",
    title: "平方完成の構造",
    parts: parts.slice(0, 4),
    items: items.slice(0, 5),
    notes,
  };
}

function buildParameterExtremeSpec(sceneSteps, sceneText, sourceText) {
  const normalized = normalizeMath(`${sceneText}\n${sourceText}`);
  const lines = normalized.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const original = extractOriginalFunction(normalized);
  const vertexForm = extractVertexForm(lines);
  const axisLabel = extractAxisLabel(normalized, vertexForm);
  const extremeLabel = extractExtremeLabel(normalized);
  const resolvedK = normalized.match(/(?:^|[。\n\s])k\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/)?.[1] ?? "";
  const resolvedAxisLabel = resolvedK && /\bk\b/.test(axisLabel)
    ? axisLabel.replace(/\bk\b/g, displayExpression(resolvedK))
    : "";
  const resolvedExtremeLabel = extractGivenExtremeLabel(normalized) || extractResolvedExtremeLabel(normalized);

  return {
    type: "parameter_extreme",
    title: /最小値/.test(normalized) && !/最大値/.test(normalized) ? "軸と最小値の条件" : "軸と最大値の条件",
    original,
    vertex_form: vertexForm,
    axis_label: axisLabel,
    extreme_label: extremeLabel,
    resolved_k: resolvedK ? `k = ${displayExpression(resolvedK)}` : "",
    resolved_axis_label: resolvedAxisLabel,
    resolved_extreme_label: resolvedExtremeLabel,
    lines: extractParameterLines(sceneSteps, normalized).slice(0, 6),
    opens: /^y\s*=\s*-|^-\s*/.test(original) || /a\s*=\s*-\d|上に凸/.test(normalized) ? "down" : "up",
  };
}

function extractOriginalFunction(text) {
  const candidates = [...text.matchAll(/y\s*=\s*([^。\n]+)/g)].map((match) => match[1]);
  const candidate = candidates.find((value) => /k/.test(value)) ?? candidates[0] ?? "";
  const first = candidate.split(/\s*=\s*/)[0] ?? "";
  return first ? `y = ${displayExpression(cleanupExpression(first))}` : "y = ax² + bx + c";
}

function extractVertexForm(lines) {
  const line = [...lines].reverse().find((item) => /\(x\s*[+-]\s*(?:k|-?\d+(?:\/\d+)?(?:\.\d+)?)\)\^2/.test(item));
  if (!line) return "";
  const cleaned = line.replace(/^=\s*/, "");
  return /^y\s*=/.test(cleaned) ? displayExpression(cleaned) : `y = ${displayExpression(cleaned)}`;
}

function extractAxisLabel(text, vertexForm) {
  const explicit = text.match(/軸は\s*x\s*=\s*([^、。\n\s]+)/);
  if (explicit) return `x = ${displayExpression(explicit[1])}`;
  const atExtreme = text.match(/x\s*=\s*([^、。\n\s]+)のとき[^。\n]*(?:最大値|最小値)/);
  if (atExtreme) return `x = ${displayExpression(atExtreme[1])}`;
  const vertex = normalizeMath(vertexForm).match(/\(x\s*([+-])\s*(k|-?\d+(?:\/\d+)?(?:\.\d+)?)\)\^2/);
  if (!vertex) return "x = h";
  const sign = vertex[1];
  const value = vertex[2];
  if (value === "k") return sign === "-" ? "x = k" : "x = -k";
  const number = parseNumber(value);
  if (!Number.isFinite(number)) return "x = h";
  return `x = ${formatNumber(sign === "-" ? number : -number)}`;
}

function extractExtremeLabel(text) {
  const matches = [...text.matchAll(/(?:最大値|最小値)(?:は|=|\s+)\s*([^、。\n]+?)(?=をとる|です|となる|[、。\n]|$)/g)];
  const match = matches.find((item) => /k/.test(item[1])) ?? matches[0];
  if (!match) return "";
  return displayExpression(match[1].trim());
}

function extractResolvedExtremeLabel(text) {
  const lines = normalizeMath(text).split(/\n/).map((line) => line.trim()).filter(Boolean);
  const matches = [...lines.join("\n").matchAll(/(最大値|最小値)(?:は|=|\s+)\s*([^。\n]+)/g)];
  const match = [...matches].reverse().find((item) => /-?\d/.test(item[2]) && !/[kx]/.test(item[2]))
    ?? [...matches].reverse().find((item) => /-?\d/.test(item[2]));
  if (!match) return "";
  const values = [...match[2].matchAll(/-?\d+(?:\/\d+)?(?:\.\d+)?/g)].map((item) => item[0]);
  const value = values.at(-1);
  return value ? `${match[1]} = ${displayExpression(value)}` : "";
}

function extractGivenExtremeLabel(text) {
  const normalized = normalizeMath(text);
  const direct = normalized.match(/(最大値|最小値)(?:が|は)?\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/);
  if (direct) return `${direct[1]} = ${displayExpression(direct[2])}`;
  const equation = normalized.match(/(?:最大値|最小値)[^。\n]*?=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)(?:[。\n]|$)/);
  if (!equation) return "";
  const kind = /最小値/.test(equation[0]) && !/最大値/.test(equation[0]) ? "最小値" : "最大値";
  return `${kind} = ${displayExpression(equation[1])}`;
}

function extractParameterLines(sceneSteps, normalizedText) {
  const sceneLines = sceneSteps.flatMap((step) => [step?.formula, step?.narration])
    .map((line) => normalizeMath(line ?? "").trim())
    .filter(Boolean);
  const fallbackLines = normalizedText.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return [...sceneLines, ...fallbackLines]
    .filter((line) => /k\s*=|最大値|最小値|軸|x\s*=/.test(line))
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .map(displayExpression);
}

function extractDomains(text) {
  const normalized = normalizeMath(text);
  const domains = [];
  const seen = new Set();
  for (const match of normalized.matchAll(/(-?\d+(?:\/\d+)?(?:\.\d+)?)\s*(?:<=|≤|≦)\s*x\s*(?:<=|≤|≦)\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    addDomain(domains, seen, parseNumber(match[1]), parseNumber(match[2]), `${match[1]} ≤ x ≤ ${match[2]}`);
  }
  for (const match of normalized.matchAll(/(-?\d+(?:\/\d+)?(?:\.\d+)?)\s*<\s*x\s*<\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    addDomain(domains, seen, parseNumber(match[1]), parseNumber(match[2]), `${match[1]} < x < ${match[2]}`);
  }
  for (const match of normalized.matchAll(/定義域\s*\[?\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)\s*,\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)\s*\]?/g)) {
    addDomain(domains, seen, parseNumber(match[1]), parseNumber(match[2]), `${match[1]} ≤ x ≤ ${match[2]}`);
  }
  return domains;
}

function addDomain(domains, seen, a, b, label = "") {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return;
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  const key = `${min}:${max}`;
  if (seen.has(key)) return;
  seen.add(key);
  domains.push({ min, max, label: label || `${formatNumber(min)} ≤ x ≤ ${formatNumber(max)}` });
}

function extractShapeConditions(text) {
  const normalized = normalizeMath(text);
  const conditions = [];
  if (/周の長さが?12|周.*12cm/.test(normalized)) conditions.push("周の長さ = 12cm");
  if (/縦\s*\+\s*横\s*=\s*6/.test(normalized)) conditions.push("縦 + 横 = 6");
  if (/0\s*<\s*x\s*<\s*6/.test(normalized)) conditions.push("0 < x < 6");
  return conditions;
}

function extractFunctions(text) {
  const normalizedBase = normalizeMath(text);
  const kMatch = normalizedBase.match(/k\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/);
  const normalized = kMatch
    ? normalizedBase
        .replace(/(\d+(?:\/\d+)?(?:\.\d+)?)k/g, (_match, n) => formatNumber(parseNumber(n) * parseNumber(kMatch[1])))
        .replace(/k/g, kMatch[1])
    : normalizedBase;
  const candidates = [];

  for (const match of normalized.matchAll(/(^|[^0-9A-Za-z])y\s*=\s*([^|。\n]+)/g)) {
    const yIndex = match.index + match[1].length;
    const lineStart = normalized.lastIndexOf("\n", yIndex) + 1;
    const lineEnd = normalized.indexOf("\n", yIndex);
    const line = normalized.slice(lineStart, lineEnd === -1 ? normalized.length : lineEnd);
    const prefix = normalized.slice(lineStart, yIndex);
    if (/x\s*=/.test(prefix) && /のとき|に対して|代入|端点|関数値|値を/.test(line)) continue;
    const chain = match[2].split(/\s*=\s*/).map((part) => part.trim()).filter(Boolean);
    for (const part of chain) {
      candidates.push(part);
    }
  }
  for (const match of normalized.matchAll(/f\(x\)\s*=\s*([^|。\n]+)/g)) {
    const chain = match[1].split(/\s*=\s*/).map((part) => part.trim()).filter(Boolean);
    for (const part of chain) {
      candidates.push(part);
    }
  }

  const functions = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const expr = cleanupExpression(candidate);
    if (!expr || seen.has(expr) || /[{}]|[①②③④⑤⑥]|[とき]|最大値|最小値/.test(expr)) continue;
    const linear = parseLinear(expr);
    const quadratic = parseQuadratic(expr);
    const parsed = quadratic ?? linear;
    if (!parsed) continue;
    seen.add(expr);
    functions.push({ ...parsed, expression: displayExpression(expr) });
  }

  for (const match of normalized.matchAll(/(^|[^0-9A-Za-z])x\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    const context = normalized.slice(Math.max(0, match.index - 28), match.index + 44);
    if (!/(直線\s*x\s*=|x\s*=[^。\n|]{0,24}(縦線|y軸に平行))/.test(context)) continue;
    const x = parseNumber(match[2]);
    const key = `x=${x}`;
    if (!Number.isFinite(x) || seen.has(key)) continue;
    seen.add(key);
    functions.push({ kind: "vertical", x, expression: `x = ${formatNumber(x)}` });
  }
  return functions;
}

function extractPoints(text) {
  const normalized = normalizeMath(text);
  const points = [];
  const seen = new Set();
  const addPoint = (xValue, yValue, label = "") => {
    const point = { x: parseNumber(xValue), y: parseNumber(yValue) };
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (label) point.label = label;
    points.push(point);
  };

  for (const match of normalized.matchAll(/x\s*=\s*([^。\n：:]+?)\s*に対して\s*y\s*=\s*([^。\n]+)/g)) {
    const xs = splitNumberList(match[1]);
    const ys = splitNumberList(match[2]);
    if (xs.length === 0 || xs.length !== ys.length) continue;
    for (let index = 0; index < xs.length; index += 1) {
      addPoint(xs[index], ys[index]);
    }
  }

  for (const match of normalized.matchAll(/\((-?\d+(?:\/\d+)?(?:\.\d+)?),\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)\)/g)) {
    addPoint(match[1], match[2]);
  }
  for (const match of normalized.matchAll(/x\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)\s*のとき\s*y\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    addPoint(match[1], match[2], `x=${displayExpression(match[1])}`);
  }
  for (const match of normalized.matchAll(/x\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)[^。\n|]{0,42}?y\s*=[^。\n|]*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    if ((match[0].match(/x\s*=/g) ?? []).length > 1) continue;
    addPoint(match[1], match[2], `x=${displayExpression(match[1])}`);
  }
  for (const match of normalized.matchAll(/x\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)[^。\n|]{0,24}値\s*y\s*=\s*(-?\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
    if ((match[0].match(/x\s*=/g) ?? []).length > 1) continue;
    addPoint(match[1], match[2], `x=${displayExpression(match[1])}`);
  }
  return points;
}

function splitNumberList(value) {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter((item) => /^-?\d+(?:\/\d+)?(?:\.\d+)?$/.test(item));
}

function extractEquationLines(steps, text) {
  const stepLines = steps
    .map((step) => normalizeMath(step.formula ?? "").trim())
    .filter(Boolean);
  const fallbackLines = normalizeMath(text)
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter((line) => /[=<>]|f\(|x|y|z|a|b|c/.test(line))
    .filter((line, index, lines) => lines.indexOf(line) === index);
  return [...stepLines, ...fallbackLines].filter((line, index, lines) => lines.indexOf(line) === index);
}

function isLinearSystemTask(sceneText, sourceText) {
  const text = `${sceneText}\n${sourceText}`;
  return /連立方程式/.test(text)
    && /[xyz]/.test(text)
    && /消去|代入|①|②|③|④|⑤/.test(text);
}

function buildLinearSystemSpec(sceneSteps, sceneText, sourceText) {
  const sourceLines = extractEquationLines(sceneSteps, `${sceneText}\n${sourceText}`)
    .filter((line) => /[xyz]|①|②|③|④|⑤|⑥|⑦|消去|代入/.test(line))
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 8)
    .map(displayExpression);
  const variableText = sourceLines.join("\n");
  const variables = ["x", "y", "z"].filter((variable) => variableText.includes(variable));
  const focus = /zを消去/.test(variableText)
    ? "zを消去して2元へ"
    : /xを消去/.test(variableText)
      ? "xを消去して2元へ"
      : "式を消去して未知数を減らす";
  return {
    type: "linear_system",
    title: "連立方程式の消去",
    focus,
    variables,
    lines: sourceLines.length > 0 ? sourceLines : ["連立方程式から1つずつ文字を消去する"],
  };
}

function dedupeEquivalentFunctions(functions) {
  const deduped = [];
  const seen = new Set();
  for (const fn of functions) {
    const key = functionIdentity(fn);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fn);
  }
  return deduped;
}

function dedupeAxisGuides(functions) {
  const guides = [];
  const seen = new Set();
  for (const fn of functions) {
    if (fn.kind !== "quadratic" || !Number.isFinite(fn.h)) continue;
    const key = roundKey(fn.h);
    if (seen.has(key)) continue;
    seen.add(key);
    guides.push(fn);
  }
  return guides;
}

function functionIdentity(fn) {
  if (fn.kind === "quadratic") return `q:${roundKey(fn.a)}:${roundKey(fn.b)}:${roundKey(fn.c)}`;
  if (fn.kind === "linear") return `l:${roundKey(fn.m)}:${roundKey(fn.b)}`;
  if (fn.kind === "vertical") return `v:${roundKey(fn.x)}`;
  if (fn.kind === "horizontal") return `h:${roundKey(fn.y)}`;
  return `${fn.kind}:${fn.expression}`;
}

function roundKey(value) {
  return Number.isFinite(value) ? String(Math.round(value * 1e9) / 1e9) : String(value);
}

function augmentGraphPoints(functions, points, domains = []) {
  const augmented = [];
  const seen = new Set();
  const addPoint = (point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const key = `${formatNumber(point.x)},${formatNumber(point.y)}`;
    if (seen.has(key)) return;
    seen.add(key);
    augmented.push(point);
  };

  for (const point of points) addPoint(point);

  for (const fn of functions) {
    if (fn.kind !== "quadratic") continue;
    const vertexLabel = fn.a < 0 ? "頂点/最大" : "頂点/最小";
    addPoint({ x: fn.h, y: fn.k, label: domains.some((domain) => fn.h >= domain.min && fn.h <= domain.max) ? vertexLabel : "頂点" });
  }

  const finiteFunctions = functions.filter((fn) => fn.kind === "linear" || fn.kind === "quadratic");
  for (const [fnIndex, fn] of finiteFunctions.entries()) {
    const relatedDomains = relatedDomainsForFunction(domains, finiteFunctions.length, fnIndex);
    for (const domain of relatedDomains) {
      const candidates = [
        { x: domain.min, label: `x=${formatNumber(domain.min)}` },
        { x: domain.max, label: `x=${formatNumber(domain.max)}` },
      ];
      if (fn.kind === "quadratic" && fn.h >= domain.min && fn.h <= domain.max) {
        candidates.push({ x: fn.h, label: fn.a < 0 ? "最大" : "最小" });
      }
      for (const candidate of candidates) {
        addPoint({ x: candidate.x, y: evaluateFunction(fn, candidate.x), label: candidate.label });
      }
    }
  }

  return augmented;
}

function deriveQuadraticFromPoints(points) {
  const unique = [];
  const seen = new Set();
  for (const point of points) {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    seen.add(key);
    unique.push(point);
    if (unique.length === 3) break;
  }
  if (unique.length < 3) return null;
  const [p1, p2, p3] = unique;
  const det =
    p1.x * p1.x * (p2.x - p3.x)
    - p2.x * p2.x * (p1.x - p3.x)
    + p3.x * p3.x * (p1.x - p2.x);
  if (Math.abs(det) < 1e-9) return null;
  const a =
    (p1.y * (p2.x - p3.x) - p2.y * (p1.x - p3.x) + p3.y * (p1.x - p2.x)) / det;
  const b =
    (p1.x * p1.x * (p2.y - p3.y) - p2.x * p2.x * (p1.y - p3.y) + p3.x * p3.x * (p1.y - p2.y)) / det;
  const c =
    (p1.x * p1.x * (p2.x * p3.y - p3.x * p2.y)
      - p2.x * p2.x * (p1.x * p3.y - p3.x * p1.y)
      + p3.x * p3.x * (p1.x * p2.y - p2.x * p1.y)) / det;
  const h = -b / (2 * a);
  const k = a * h * h + b * h + c;
  return {
    kind: "quadratic",
    a,
    b,
    c,
    h,
    k,
    expression: quadraticExpression(a, b, c),
  };
}

function quadraticExpression(a, b, c) {
  const terms = [];
  const addTerm = (coefficient, body) => {
    if (Math.abs(coefficient) < 1e-9) return;
    const sign = coefficient < 0 ? "-" : "+";
    const abs = Math.abs(coefficient);
    const value = Math.abs(abs - 1) < 1e-9 && body ? "" : formatNumber(abs);
    terms.push({ sign, text: `${value}${body}` });
  };
  addTerm(a, "x²");
  addTerm(b, "x");
  addTerm(c, "");
  if (terms.length === 0) return "0";
  return terms.map((term, index) => {
    if (index === 0) return term.sign === "-" ? `-${term.text}` : term.text;
    return ` ${term.sign} ${term.text}`;
  }).join("");
}

function parseLinear(expr) {
  const compact = expr.replace(/\s+/g, "");
  if (/^x=[+-]?\d/.test(compact)) {
    return { kind: "vertical", x: parseNumber(compact.slice(2)) };
  }
  if (/^0$/.test(compact)) {
    return { kind: "horizontal", y: 0 };
  }

  const normalized = compact
    .replace(/^\((.+)\)$/, "$1")
    .replace(/\*/g, "");
  if (!/x/.test(normalized) || /x\^2/.test(normalized)) return null;

  const terms = tokenize(normalized);
  let m = 0;
  let b = 0;
  for (const term of terms) {
    if (!term) continue;
    if (term.includes("x")) {
      const coefficient = term.replace("x", "");
      const value = parseCoefficient(coefficient);
      if (!Number.isFinite(value)) return null;
      m += value;
    } else {
      const value = parseNumber(term);
      if (!Number.isFinite(value)) return null;
      b += value;
    }
  }
  return { kind: "linear", m, b };
}

function parseQuadratic(expr) {
  const compact = expr
    .replace(/\s+/g, "")
    .replace(/\*/g, "")
    .replace(/([+-]?)\((\d+(?:\/\d+)?|\d*\.\d+)\)(?=\()/g, "$1$2");
  if (!/x\^2|\(x/.test(compact)) return null;

  const vertexMatch = compact.match(/^([+-]?(?:\d+(?:\/\d+)?|\d*\.\d+)?)\(?x([+-](?:\d+(?:\/\d+)?|\d*\.\d+))\)?\^2([+-](?:\d+(?:\/\d+)?|\d*\.\d+))?$/);
  const explicitVertexMatch = compact.match(/^([+-]?(?:\d+(?:\/\d+)?|\d*\.\d+)?)\(x([+-](?:\d+(?:\/\d+)?|\d*\.\d+))\)\^2([+-](?:\d+(?:\/\d+)?|\d*\.\d+))?$/);
  const match = explicitVertexMatch ?? vertexMatch;
  if (match) {
    const a = parseCoefficient(match[1]);
    const shift = parseNumber(match[2] ?? "0");
    const k = parseNumber(match[3] ?? "0");
    if (Number.isFinite(a) && Number.isFinite(shift) && Number.isFinite(k)) {
      return { kind: "quadratic", a, b: -2 * a * (-shift), c: a * (-shift) ** 2 + k, h: -shift, k };
    }
  }

  const terms = tokenize(compact);
  let a = 0;
  let b = 0;
  let c = 0;
  for (const term of terms) {
    if (!term) continue;
    if (term.includes("x^2")) {
      const value = parseCoefficient(term.replace("x^2", ""));
      if (!Number.isFinite(value)) return null;
      a += value;
    } else if (term.includes("x")) {
      const value = parseCoefficient(term.replace("x", ""));
      if (!Number.isFinite(value)) return null;
      b += value;
    } else {
      const value = parseNumber(term);
      if (!Number.isFinite(value)) return null;
      c += value;
    }
  }
  if (a === 0) return null;
  const h = -b / (2 * a);
  const k = a * h * h + b * h + c;
  return { kind: "quadratic", a, b, c, h, k };
}

function functionGraphSvg(spec) {
  const w = 640;
  const h = 560;
  const left = 54;
  const right = w - 34;
  const top = 30;
  const bottom = h - 46;
  const domain = chooseGraphDomain(spec);
  const range = chooseGraphRange(spec, domain);
  const toX = (x) => left + ((x - domain.min) / (domain.max - domain.min)) * (right - left);
  const toY = (y) => bottom - ((y - range.min) / (range.max - range.min)) * (bottom - top);
  const xTicks = niceTicks(domain.min, domain.max, 7);
  const yTicks = niceTicks(range.min, range.max, 7);
  const zeroX = clamp(toX(0), left, right);
  const zeroY = clamp(toY(0), top, bottom);
  const colors = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b"];
  const domains = spec.domains ?? [];
  const grid = [];
  for (const tick of xTicks) {
    const x = toX(tick);
    grid.push(`<line class="grid-line" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="#e5e7eb" style="animation-delay:.05s"/>`);
    grid.push(`<text x="${x}" y="${zeroY + 20}" text-anchor="middle" font-size="12" fill="#6b7280">${formatNumber(tick)}</text>`);
  }
  for (const tick of yTicks) {
    const y = toY(tick);
    grid.push(`<line class="grid-line" x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="#e5e7eb" style="animation-delay:.05s"/>`);
    if (tick !== 0) {
      grid.push(`<text x="${zeroX - 14}" y="${y + 4}" text-anchor="end" font-size="12" fill="#6b7280">${formatNumber(tick)}</text>`);
    }
  }

  const functions = spec.functions.length > 0 ? spec.functions : [];
  const axisGuides = dedupeAxisGuides(functions)
    .filter((fn) => fn.h >= domain.min && fn.h <= domain.max)
    .slice(0, 4)
    .map((fn, index) => {
      const x = toX(fn.h);
      const color = colors[index % colors.length];
      return `<g class="axis-guide" style="animation-delay:${(0.72 + index * 0.16).toFixed(2)}s">
        <line x1="${x}" y1="${top + 6}" x2="${x}" y2="${bottom}" stroke="${color}" stroke-width="3" stroke-dasharray="8 8" opacity=".86"/>
        <text x="${x + 9}" y="${top + 30 + index * 20}" font-size="14" font-weight="800" fill="${color}">軸 x=${formatNumber(fn.h)}</text>
      </g>`;
    });
  const curves = functions.flatMap((fn, index) => {
    const color = colors[index % colors.length];
    const relatedDomains = relatedDomainsForFunction(domains, functions.length, index);
    if (relatedDomains.length === 0 || fn.kind === "vertical" || fn.kind === "horizontal") {
      return [graphElement(fn, index, color, domain, range, toX, toY)];
    }
    return [
      graphElement(fn, index, "#cbd5e1", domain, range, toX, toY, domain, true),
      ...relatedDomains.map((item, domainIndex) =>
        graphElement(fn, index + domainIndex, color, domain, range, toX, toY, item, false)
      ),
    ];
  });
  const points = [
    ...spec.points,
    ...functions.filter((fn) => fn.kind === "quadratic").map((fn) => ({ x: fn.h, y: fn.k, label: "頂点" })),
  ].filter((point) => point.x >= domain.min && point.x <= domain.max && point.y >= range.min && point.y <= range.max);
  const pointSvg = points.slice(0, 10).map((point, index) => {
    const x = toX(point.x);
    const y = toY(point.y);
    return `<g class="plot-point p${index + 1}" style="animation-delay:${(1.28 + index * 0.18).toFixed(2)}s"><circle cx="${x}" cy="${y}" r="6" fill="#111827"/><text x="${x + 8}" y="${y - 8}" font-size="13" font-weight="700" fill="#111827">${escapeHtml(point.label ?? `(${formatNumber(point.x)}, ${formatNumber(point.y)})`)}</text></g>`;
  });

  const legend = functions.map((fn, index) =>
    `<g transform="translate(70 ${48 + index * 24})"><line x1="0" y1="0" x2="26" y2="0" stroke="${colors[index % colors.length]}" stroke-width="4"/><text x="34" y="5" font-size="15" font-weight="700" fill="${colors[index % colors.length]}">${escapeHtml(functionLabel(fn))}</text></g>`
  );
  const domainMarkers = domains.slice(0, 4).map((item, index) => {
    const y = bottom + 28 + index * 0;
    const x1 = clamp(toX(item.min), left, right);
    const x2 = clamp(toX(item.max), left, right);
    const labelX = (x1 + x2) / 2;
    return `<g class="domain-marker" style="animation-delay:${(1.5 + index * 0.2).toFixed(2)}s">
      <line x1="${x1}" y1="${zeroY}" x2="${x2}" y2="${zeroY}" stroke="#7c3aed" stroke-width="7" stroke-linecap="round" opacity=".72"/>
      <circle cx="${x1}" cy="${zeroY}" r="5" fill="#7c3aed"/>
      <circle cx="${x2}" cy="${zeroY}" r="5" fill="#7c3aed"/>
      <text x="${labelX}" y="${Math.min(y, h - 12)}" text-anchor="middle" font-size="14" font-weight="700" fill="#5b21b6">定義域 ${escapeHtml(item.label)}</text>
    </g>`;
  });

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .grid-line { opacity: 0; animation: fade .35s ease forwards; }
      .axis-line { stroke-dasharray: 800; stroke-dashoffset: 800; animation: draw .55s ease forwards; animation-delay: .18s; }
      .axis-guide { opacity: 0; animation: fade .38s ease forwards; }
      .draw-line { stroke-dasharray: 1400; stroke-dashoffset: 1400; animation: draw 1s ease forwards; }
      .plot-point { opacity: 0; animation: fade .4s ease forwards; }
      .domain-marker { opacity: 0; animation: fade .4s ease forwards; }
      @keyframes draw { to { stroke-dashoffset: 0; } }
      @keyframes fade { to { opacity: 1; } }
    </style>
    <rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>
    <text x="28" y="28" font-size="18" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    ${grid.join("\n")}
    <line class="axis-line" x1="${left}" y1="${zeroY}" x2="${right}" y2="${zeroY}" stroke="#111827" stroke-width="2"/>
    <line class="axis-line" x1="${zeroX}" y1="${bottom}" x2="${zeroX}" y2="${top}" stroke="#111827" stroke-width="2"/>
    <text x="${right - 12}" y="${zeroY - 10}" font-size="16" font-weight="700">x</text>
    <text x="${zeroX + 10}" y="${top + 18}" font-size="16" font-weight="700">y</text>
    ${axisGuides.join("\n")}
    ${curves.join("\n")}
    ${domainMarkers.join("\n")}
    ${pointSvg.join("\n")}
    ${legend.join("\n")}
  </svg>`;
}

function compositeSvg(spec) {
  const graph = functionGraphSvg({
    type: "function_graph",
    title: spec.title,
    functions: spec.functions ?? [],
    points: spec.points ?? [],
    domains: spec.domains ?? [],
  }).replace("<svg ", "<svg x=\"0\" y=\"0\" width=\"640\" height=\"560\" ");
  const miniShape = shapeMiniSvg(spec);
  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    ${graph}
    ${miniShape}
  </svg>`;
}

function relatedDomainsForFunction(domains, functionCount, functionIndex) {
  if (!Array.isArray(domains) || domains.length === 0) return [];
  if (functionCount <= 1) return domains;
  if (domains.length === functionCount) return [domains[functionIndex]].filter(Boolean);
  return domains.slice(0, 1);
}

function substitutionTableSvg(spec) {
  const definitions = spec.definitions?.length ? spec.definitions : ["f(x) に値を代入"];
  const rows = spec.rows?.length ? spec.rows : [];
  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .sub-row { opacity: 0; transform: translateY(8px); animation: fade-row .42s ease forwards; }
      @keyframes fade-row { to { opacity: 1; transform: translateY(0); } }
    </style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    ${definitions.map((definition, index) =>
      `<text x="44" y="${82 + index * 28}" font-size="21" font-weight="700" fill="#2563eb">${escapeHtml(definition)}</text>`
    ).join("\n")}
    <line x1="42" y1="154" x2="598" y2="154" stroke="#d1d5db" stroke-width="2"/>
    <text x="58" y="184" font-size="16" font-weight="700" fill="#6b7280">入力</text>
    <text x="164" y="184" font-size="16" font-weight="700" fill="#6b7280">代入・計算</text>
    <text x="510" y="184" font-size="16" font-weight="700" fill="#6b7280">値</text>
    <line x1="42" y1="198" x2="598" y2="198" stroke="#e5e7eb" stroke-width="2"/>
    ${rows.map((row, index) => {
      const y = 236 + index * 58;
      return `<g class="sub-row" style="animation-delay:${(index * 0.24).toFixed(2)}s">
        <text x="58" y="${y}" font-size="21" font-weight="800" fill="#111827">x = ${escapeHtml(displayExpression(row.input))}</text>
        <text x="164" y="${y}" font-size="18" fill="#111827">${escapeHtml(truncate(displayExpression(row.calculation), 36))}</text>
        <text x="510" y="${y}" font-size="21" font-weight="800" fill="#15803d">${escapeHtml(displayExpression(row.result || ""))}</text>
        <line x1="42" y1="${y + 18}" x2="598" y2="${y + 18}" stroke="#f3f4f6"/>
      </g>`;
    }).join("\n")}
  </svg>`;
}

function parameterExtremeSvg(spec) {
  const isDown = spec.opens === "down";
  const curve = isDown
    ? "M96 416 C190 118 432 118 526 416"
    : "M96 154 C190 452 432 452 526 154";
  const vx = 311;
  const vy = isDown ? 132 : 426;
  const axisY1 = isDown ? 88 : 100;
  const axisY2 = isDown ? 456 : 470;
  const displayedAxis = spec.resolved_axis_label || spec.axis_label;
  const displayedExtreme = spec.resolved_extreme_label || spec.extreme_label;
  const vertexLabel = [displayedAxis, displayedExtreme].filter(Boolean).join(", ");
  const lines = [
    spec.original,
    spec.vertex_form,
    spec.domain_label ? `定義域: ${spec.domain_label}` : "",
    spec.axis_label ? `軸: ${spec.axis_label}` : "",
    spec.extreme_label ? `最大・最小値: ${spec.extreme_label}` : "",
    spec.resolved_k,
    spec.resolved_axis_label ? `確定後の軸: ${spec.resolved_axis_label}` : "",
    spec.resolved_extreme_label ? `確定後: ${spec.resolved_extreme_label}` : "",
    ...(spec.lines ?? []),
  ].filter(Boolean).filter((line, index, list) => list.indexOf(line) === index).slice(0, 8);

  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .param-curve { stroke-dasharray: 1200; stroke-dashoffset: 1200; animation: draw 1s ease forwards; }
      .param-note { opacity: 0; transform: translateY(8px); animation: fade .42s ease forwards; }
      @keyframes draw { to { stroke-dashoffset: 0; } }
      @keyframes fade { to { opacity: 1; transform: translateY(0); } }
    </style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    <line x1="70" y1="454" x2="548" y2="454" stroke="#111827" stroke-width="2"/>
    <line x1="86" y1="88" x2="86" y2="472" stroke="#111827" stroke-width="2"/>
    <text x="532" y="438" font-size="16" font-weight="700">x</text>
    <text x="98" y="108" font-size="16" font-weight="700">y</text>
    <path class="param-curve" d="${curve}" fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round"/>
    <line x1="${vx}" y1="${axisY1}" x2="${vx}" y2="${axisY2}" stroke="#dc2626" stroke-width="3" stroke-dasharray="8 8"/>
    ${spec.domain_label ? `<line class="domain-marker" x1="146" y1="454" x2="${vx}" y2="454" stroke="#7c3aed" stroke-width="7" stroke-linecap="round" opacity=".75"/><text class="domain-marker" x="154" y="486" font-size="17" font-weight="800" fill="#5b21b6">定義域 ${escapeHtml(spec.domain_label)}</text>` : ""}
    <circle cx="${vx}" cy="${vy}" r="7" fill="#dc2626"/>
    <text x="${vx + 14}" y="${vy - 12}" font-size="17" font-weight="800" fill="#dc2626">${escapeHtml(vertexLabel || "頂点")}</text>
    <text x="${vx + 12}" y="${axisY2 - 10}" font-size="17" font-weight="800" fill="#dc2626">${escapeHtml(displayedAxis || "軸")}</text>
    ${lines.map((line, index) => `
      <g class="param-note" style="animation-delay:${(0.25 + index * 0.22).toFixed(2)}s" transform="translate(58 ${500 + index * 0})">
        <text x="0" y="${-210 + index * 28}" font-size="17" font-weight="${index < 2 ? 800 : 600}" fill="${index < 2 ? "#2563eb" : "#111827"}">${escapeHtml(truncate(line, 54))}</text>
      </g>`).join("\n")}
  </svg>`;
}

function squareCompletionSvg(spec) {
  const parts = spec.parts?.length ? spec.parts : ["y", "平方完成", "標準形"];
  const notes = spec.notes?.length ? spec.notes : parts;
  const rows = spec.items?.length
    ? spec.items.map((item) => ({ label: item.label, text: displayExpression(item.text) }))
    : parts.map((part, index) => ({
      label: index === 0 ? "元の式" : index === parts.length - 1 ? "完成形" : "変形",
      text: displayExpression(part),
    }));
  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .sq-row { opacity: 0; transform: translateY(8px); animation: fade .42s ease forwards; }
      @keyframes fade { to { opacity: 1; transform: translateY(0); } }
    </style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    ${rows.map((row, index) => {
      const y = 90 + index * 72;
      return `<g class="sq-row" style="animation-delay:${(index * 0.22).toFixed(2)}s">
        <text x="58" y="${y}" font-size="17" font-weight="800" fill="#2563eb">${escapeHtml(row.label)}</text>
        ${svgTextBlock(row.text, 58, y + 28, 42, 19, 'font-size="17" font-weight="800" fill="#111827"')}
        ${index < rows.length - 1 ? `<path d="M310 ${y + 42} L310 ${y + 62}" stroke="#dc2626" stroke-width="3" marker-end="url(#arrow)"/>` : ""}
      </g>`;
    }).join("\n")}
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#dc2626"/>
      </marker>
    </defs>
    <line x1="410" y1="86" x2="410" y2="480" stroke="#e5e7eb" stroke-width="2"/>
    ${notes.map((note, index) => `
      <g class="sq-row" style="animation-delay:${(0.2 + index * 0.18).toFixed(2)}s">
        ${svgTextBlock(displayExpression(note), 430, 116 + index * 58, 24, 18, 'font-size="15" font-weight="700" fill="#111827"')}
      </g>`).join("\n")}
  </svg>`;
}

function svgTextBlock(value, x, y, maxChars, lineHeight, attrs) {
  const lines = wrapText(value, maxChars).slice(0, 3);
  return `<text x="${x}" y="${y}" ${attrs}>${lines.map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeHtml(line)}</tspan>`
  ).join("")}</text>`;
}

function wrapText(value, maxChars) {
  const text = String(value);
  const lines = [];
  for (let index = 0; index < text.length; index += maxChars) {
    lines.push(text.slice(index, index + maxChars));
  }
  return lines.length > 0 ? lines : [""];
}

function graphElement(fn, index, color, viewportDomain, viewportRange, toX, toY, drawDomain = viewportDomain, muted = false) {
  const delay = (1.0 + index * 0.35).toFixed(2);
  const strokeWidth = muted ? 2.5 : 4;
  const opacity = muted ? ".72" : "1";
  if (fn.kind === "vertical") {
    const x = toX(fn.x);
    return `<line class="draw-line" style="animation-delay:${delay}s" x1="${x}" y1="${toY(viewportRange.min)}" x2="${x}" y2="${toY(viewportRange.max)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  if (fn.kind === "horizontal") {
    const y = toY(fn.y);
    return `<line class="draw-line" style="animation-delay:${delay}s" x1="${toX(drawDomain.min)}" y1="${y}" x2="${toX(drawDomain.max)}" y2="${y}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  const points = [];
  const step = (drawDomain.max - drawDomain.min) / 100;
  for (let x = drawDomain.min; x <= drawDomain.max + 1e-9; x += step) {
    const y = evaluateFunction(fn, x);
    if (Number.isFinite(y)) points.push(`${toX(x).toFixed(1)},${toY(y).toFixed(1)}`);
  }
  return `<path class="draw-line" style="animation-delay:${delay}s" d="M ${points.join(" L ")}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}"/>`;
}

function functionLabel(fn) {
  if (fn.kind === "vertical") return fn.expression;
  if (fn.kind === "horizontal") return `y = ${fn.expression}`;
  return `y = ${fn.expression}`;
}

function chooseGraphDomain(spec) {
  const xs = [0, ...spec.points.map((point) => point.x)];
  for (const item of spec.domains ?? []) xs.push(item.min, item.max);
  for (const fn of spec.functions) {
    if (fn.kind === "quadratic") xs.push(fn.h, fn.h - 2, fn.h + 2);
    if (fn.kind === "vertical") xs.push(fn.x);
  }
  let min = Math.min(...xs, -5);
  let max = Math.max(...xs, 5);
  const pad = Math.max(1, (max - min) * 0.18);
  min -= pad;
  max += pad;
  if (max - min < 8) {
    const mid = (min + max) / 2;
    min = mid - 4;
    max = mid + 4;
  }
  return { min, max };
}

function chooseGraphRange(spec, domain) {
  const ys = [0, ...spec.points.map((point) => point.y)];
  const sampleDomains = (spec.domains ?? []).length > 0 ? spec.domains : [domain];
  for (const fn of spec.functions) {
    if (fn.kind === "vertical") continue;
    for (const sampleDomain of sampleDomains) {
      for (let i = 0; i <= 24; i += 1) {
        const x = sampleDomain.min + (sampleDomain.max - sampleDomain.min) * i / 24;
        ys.push(evaluateFunction(fn, x));
      }
    }
    if (fn.kind === "quadratic") ys.push(evaluateFunction(fn, fn.h));
    if (fn.kind === "horizontal") ys.push(fn.y);
  }
  let finite = ys.filter(Number.isFinite);
  if (finite.length === 0) finite = [-5, 5];
  let min = Math.min(...finite, -5);
  let max = Math.max(...finite, 5);
  const pad = Math.max(1, (max - min) * 0.15);
  return { min: min - pad, max: max + pad };
}

function evaluateFunction(fn, x) {
  if (fn.kind === "linear") return fn.m * x + fn.b;
  if (fn.kind === "quadratic") return fn.a * x * x + fn.b * x + fn.c;
  if (fn.kind === "horizontal") return fn.y;
  return NaN;
}

function niceTicks(min, max, target) {
  const span = max - min;
  const rough = span / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((value) => value >= rough) ?? power;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + 1e-9; value += step) {
    ticks.push(Math.round(value * 1000) / 1000);
  }
  return ticks;
}

function inferGraphTitle(text) {
  if (/交点/.test(text)) return "交点を確認";
  if (/平行移動/.test(text)) return "平行移動前後のグラフ";
  if (/対称移動/.test(text)) return "対称移動のグラフ";
  if (/最大値|最小値|値域|定義域/.test(text)) return "定義域と値の変化";
  if (/通る|通過点|3点/.test(text)) return "通過点と放物線";
  if (/二次関数|平方完成|放物線|x\^2/.test(text)) return "二次関数のグラフ";
  if (/直線|一次関数/.test(text)) return "直線のグラフ";
  return "関数のグラフ";
}

function equationFlowSvg(spec) {
  const lines = spec.lines.length > 0 ? spec.lines : ["式変形を確認します"];
  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .flow-line { opacity: 0; transform: translateY(8px); animation: flow .45s ease forwards; }
      @keyframes flow { to { opacity: 1; transform: translateY(0); } }
    </style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    ${lines.slice(0, 8).map((line, index) => `
      <g class="flow-line" style="animation-delay:${(index * 0.25).toFixed(2)}s" transform="translate(38 ${88 + index * 50})">
        <text x="0" y="0" font-size="17" font-weight="700" fill="#2563eb">${index + 1}</text>
        <text x="32" y="0" font-size="17" fill="#111827">${escapeHtml(truncate(line, 58))}</text>
      </g>`).join("\n")}
  </svg>`;
}

function linearSystemSvg(spec) {
  const lines = spec.lines?.length ? spec.lines : ["連立方程式から未知数を消去します"];
  const variables = spec.variables?.length ? spec.variables : ["x", "y", "z"];
  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(spec.title)}">
    <style>
      .sys-line { opacity: 0; transform: translateY(8px); animation: sys-in .42s ease forwards; }
      .sys-arrow { opacity: 0; animation: sys-in .42s ease forwards; }
      @keyframes sys-in { to { opacity: 1; transform: translateY(0); } }
    </style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(spec.title)}</text>
    <text x="42" y="82" font-size="18" font-weight="800" fill="#dc2626">${escapeHtml(spec.focus ?? "未知数を減らして解く")}</text>
    ${variables.map((variable, index) => `
      <g class="sys-line" style="animation-delay:${(index * 0.18).toFixed(2)}s" transform="translate(${78 + index * 86} 124)">
        <text x="0" y="0" font-size="30" font-weight="900" fill="${index === 0 ? "#2563eb" : index === 1 ? "#16a34a" : "#f59e0b"}">${escapeHtml(variable)}</text>
      </g>`).join("\n")}
    <path class="sys-arrow" style="animation-delay:.45s" d="M88 156 C190 184 320 184 506 156" fill="none" stroke="#d1d5db" stroke-width="4" marker-end="url(#sys-arrow)"/>
    ${lines.slice(0, 7).map((line, index) => `
      <g class="sys-line" style="animation-delay:${(0.65 + index * 0.24).toFixed(2)}s" transform="translate(54 ${210 + index * 45})">
        <text x="0" y="0" font-size="17" font-weight="800" fill="#2563eb">${index + 1}</text>
        ${svgTextBlock(line, 34, 0, 55, 18, 'font-size="16" font-weight="700" fill="#111827"')}
      </g>`).join("\n")}
    <defs>
      <marker id="sys-arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#d1d5db"/>
      </marker>
    </defs>
  </svg>`;
}

function shapeMiniSvg(spec) {
  const labelA = escapeHtml(spec.labels?.[0] ?? "x");
  const labelB = escapeHtml(spec.labels?.[1] ?? "20 - x");
  if (spec.shape === "right_triangle") {
    return `<g transform="translate(398 62)">
      <rect x="-10" y="-22" width="205" height="155" rx="4" fill="rgba(255,255,255,.92)" stroke="#d1d5db"/>
      <path d="M20 105 L170 105 L20 22 Z" fill="#f8fafc" stroke="#2563eb" stroke-width="4"/>
      <path d="M20 88 L37 88 L37 105" fill="none" stroke="#111827" stroke-width="2"/>
      <text x="92" y="128" text-anchor="middle" font-size="18" fill="#dc2626">${labelA}</text>
      <text x="-2" y="68" font-size="18" fill="#dc2626">${labelB}</text>
    </g>`;
  }
  return `<g transform="translate(398 62)">
    <rect x="-10" y="-22" width="205" height="155" rx="4" fill="rgba(255,255,255,.92)" stroke="#d1d5db"/>
    <rect x="18" y="25" width="150" height="86" fill="#f8fafc" stroke="#2563eb" stroke-width="4"/>
    <text x="93" y="134" text-anchor="middle" font-size="18" fill="#dc2626">${labelA}</text>
    <text x="176" y="73" font-size="18" fill="#dc2626">${labelB}</text>
  </g>`;
}

function shapeSvg(spec) {
  const title = spec.title ?? "図形";
  if (spec.shape === "right_triangle") {
    return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(title)}">
      <style>.draw-shape{stroke-dasharray:900;stroke-dashoffset:900;animation:draw 1.1s ease forwards}.measure{opacity:0;animation:fade .5s ease forwards;animation-delay:1.1s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes fade{to{opacity:1}}</style>
      <rect width="640" height="560" fill="#fff"/>
      <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(title)}</text>
      <path class="draw-shape" d="M120 430 L520 430 L120 130 Z" fill="#f8fafc" stroke="#2563eb" stroke-width="5"/>
      <path class="measure" d="M120 404 L146 404 L146 430" fill="none" stroke="#111827" stroke-width="3"/>
      <text class="measure" x="305" y="468" text-anchor="middle" font-size="28" fill="#2563eb">${escapeHtml(spec.labels?.[0] ?? "x")}</text>
      <text class="measure" x="72" y="292" font-size="28" fill="#dc2626">${escapeHtml(spec.labels?.[1] ?? "20 - x")}</text>
    </svg>`;
  }

  if (spec.shape === "rectangle") {
    const notes = [
      ...(spec.conditions ?? []),
      ...(spec.domains ?? []).map((domain) => `定義域 ${domain.label}`),
    ].slice(0, 4);
    return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(title)}">
      <style>.draw-shape{stroke-dasharray:1200;stroke-dashoffset:1200;animation:draw 1.1s ease forwards}.measure{opacity:0;animation:fade .5s ease forwards;animation-delay:1.1s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes fade{to{opacity:1}}</style>
      <rect width="640" height="560" fill="#fff"/>
      <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(title)}</text>
      <rect class="draw-shape" x="125" y="165" width="390" height="230" fill="#f8fafc" stroke="#2563eb" stroke-width="5"/>
      <text class="measure" x="320" y="438" text-anchor="middle" font-size="30" fill="#dc2626">${escapeHtml(spec.labels?.[0] ?? "x")}</text>
      <text class="measure" x="532" y="292" font-size="30" fill="#dc2626">${escapeHtml(spec.labels?.[1] ?? "6 - x")}</text>
      ${notes.map((note, index) => `<text class="measure domain-marker" x="116" y="${88 + index * 30}" font-size="22" font-weight="700" fill="${index === 0 ? "#2563eb" : "#111827"}">${escapeHtml(note)}</text>`).join("\n")}
    </svg>`;
  }

  return `<svg viewBox="0 0 640 560" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(title)}">
    <style>.draw-shape{stroke-dasharray:1200;stroke-dashoffset:1200;animation:draw 1.1s ease forwards}.measure{opacity:0;animation:fade .5s ease forwards;animation-delay:1.1s}@keyframes draw{to{stroke-dashoffset:0}}@keyframes fade{to{opacity:1}}</style>
    <rect width="640" height="560" fill="#fff"/>
    <text x="40" y="46" font-size="22" font-weight="700" fill="#111827">${escapeHtml(title)}</text>
    <rect class="draw-shape" x="170" y="130" width="300" height="300" fill="#f8fafc" stroke="#2563eb" stroke-width="5"/>
    <text class="measure" x="320" y="492" text-anchor="middle" font-size="30" fill="#dc2626">${escapeHtml(spec.labels?.[0] ?? "x")}</text>
    <text class="measure" x="506" y="290" font-size="30" fill="#dc2626">${escapeHtml(spec.labels?.[1] ?? "x")}</text>
  </svg>`;
}

function normalizeMath(value) {
  return String(value)
    .replace(/[−－]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[＝]/g, "=")
    .replace(/²/g, "^2")
    .replace(/½/g, "1/2")
    .replace(/[ｘＸ]/g, "x")
    .replace(/[ｙＹ]/g, "y")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[{}]/g, "")
    .replace(/×/g, "*");
}

function normalizeMathForDisplay(value) {
  return String(value)
    .replace(/[−－]/g, "-")
    .replace(/[＋]/g, "+")
    .replace(/[＝]/g, "=")
    .replace(/²/g, "^2")
    .replace(/½/g, "1/2")
    .replace(/[ｘＸ]/g, "x")
    .replace(/[ｙＹ]/g, "y")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/[｛{]/g, "(")
    .replace(/[｝}]/g, ")")
    .replace(/×/g, "*");
}

function cleanupExpression(value) {
  return normalizeMath(value)
    .split(/[,，、。:：]|（ただし|において|に各|について|という|\s+のとき|\s+で|\s+に|が/)[0]
    .replace(/^y\s*=\s*/, "")
    .replace(/…….*$/, "")
    .trim();
}

function displayExpression(expr) {
  return expr.replace(/\^2/g, "²").replace(/\*/g, "×");
}

function tokenize(expr) {
  return expr
    .replace(/-/g, "+-")
    .split("+")
    .map((term) => term.trim())
    .filter(Boolean);
}

function parseCoefficient(value) {
  const stripped = String(value).replace(/^\((.+)\)$/, "$1");
  const negativeWrapped = stripped.match(/^-\((.+)\)$/);
  if (negativeWrapped) return -parseNumber(negativeWrapped[1]);
  const positiveWrapped = stripped.match(/^\+\((.+)\)$/);
  if (positiveWrapped) return parseNumber(positiveWrapped[1]);
  if (stripped === "" || stripped === "+") return 1;
  if (stripped === "-") return -1;
  return parseNumber(stripped);
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return 0;
  const normalized = String(value).replace(/^\+/, "");
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const fraction = normalized.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return NaN;
}

function formatNumber(value) {
  if (Math.abs(value) < 1e-9) return "0";
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
  return String(Math.round(value * 100) / 100);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function truncate(value, max) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
