import type {
  DiagramScene,
  DiagramSceneStep,
  Explanation,
  MeaningModel,
  TriangleSpec,
  VisualAsset,
} from "@/lib/types";
import { buildTriangleSpecFromModel } from "@/lib/visual/semantic/diagram-semantics";
import { buildPresentationPlanFromMeaningModel } from "@/lib/visual/scene/plan";
import { generateRightTriangleSpecificSvg } from "@/lib/visual/svg/right-triangle-specific";
import { generateGeneralTriangleSvg } from "@/lib/visual/svg/general-triangle";
import { formulaToHtml } from "@/lib/marp/math";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SLIDE_SEPARATOR = "\n\n---\n\n";
const KATEX_CSS = readFileSync(
  join(process.cwd(), "node_modules", "katex", "dist", "katex.min.css"),
  "utf-8"
);

const VISUAL_TYPE_LABELS: Record<string, string> = {
  function_graph: "関数グラフ",
  number_line: "数直線",
  triangle: "三角形",
  right_triangle_specific: "問題の図解",
};

function frontMatter(theme: string): string {
  return [
    "---",
    "marp: true",
    `theme: ${theme}`,
    "paginate: true",
    "style: |",
    "  section.visual-slide {",
    "    text-align: center;",
    "  }",
    "  section.visual-slide h2 {",
    "    text-align: left;",
    "    margin-bottom: 0.6rem;",
    "  }",
    "  section.visual-slide .visual-frame {",
    "    height: 72vh;",
    "    display: flex;",
    "    align-items: center;",
    "    justify-content: center;",
    "    overflow: hidden;",
    "  }",
    "  section.visual-slide .visual-frame img {",
    "    display: block;",
    "    max-width: 100%;",
    "    max-height: 100%;",
    "    width: auto;",
    "    height: auto;",
    "    object-fit: contain;",
    "  }",
    "  section.scene-slide {",
    "    display: grid;",
    "    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.8fr);",
    "    grid-template-rows: auto minmax(0, 1fr) auto;",
    "    gap: 0.7rem 1.2rem;",
    "    align-items: stretch;",
    "  }",
    "  section.scene-slide h2 {",
    "    margin-bottom: 0;",
    "  }",
    "  section.scene-slide .scene-visual {",
    "    grid-column: 1;",
    "    grid-row: 2 / 4;",
    "    position: relative;",
    "    align-self: center;",
    "    justify-self: stretch;",
    "    width: 100%;",
    "    height: 74vh;",
    "    overflow: hidden;",
    "  }",
    "  section.scene-slide .scene-layer {",
    "    position: absolute;",
    "    inset: 0;",
    "    display: flex;",
    "    align-items: center;",
    "    justify-content: center;",
    "    opacity: 0;",
    "    animation: scene-step-fade 0.5s ease forwards;",
    "    animation-delay: calc(var(--step-index) * 1.7s);",
    "  }",
    "  section.scene-slide .scene-layer img {",
    "    display: block;",
    "    max-width: 100%;",
    "    max-height: 100%;",
    "    width: auto;",
    "    height: auto;",
    "    object-fit: contain;",
    "  }",
    "  section.scene-slide .scene-notes {",
    "    grid-column: 2;",
    "    grid-row: 2;",
    "    align-self: start;",
    "    border-left: 4px solid #2563eb;",
    "    padding-left: 1rem;",
    "    text-align: left;",
    "  }",
    "  section.scene-slide .scene-step-note {",
    "    opacity: 0;",
    "    transform: translateY(8px);",
    "    animation: scene-step-fade 0.45s ease forwards;",
    "    animation-delay: calc(var(--step-index) * 1.7s + 0.2s);",
    "  }",
    "  section.scene-slide .scene-notes p {",
    "    font-size: 1.08rem;",
    "    line-height: 1.62;",
    "    margin: 0 0 0.72rem 0;",
    "  }",
    "  section.scene-slide .scene-formulas {",
    "    grid-column: 2;",
    "    grid-row: 3;",
    "    align-self: start;",
    "    display: grid;",
    "    gap: 0.65rem;",
    "  }",
    "  section.scene-slide .scene-formula {",
    "    margin: 1rem 0 0 0 !important;",
    "    padding: 0.75rem 0.9rem;",
    "    border: 1px solid #dbeafe;",
    "    border-radius: 8px;",
    "    background: #f8fafc;",
    "    overflow: hidden;",
    "    font-size: 1.08rem;",
    "    opacity: 0;",
    "    transform: translateY(8px);",
    "    animation: scene-step-fade 0.45s ease forwards;",
    "    animation-delay: calc(var(--step-index) * 1.7s + 0.3s);",
    "  }",
    "  section.scene-slide .scene-formula .katex-html {",
    "    display: block;",
    "  }",
    "  section.scene-slide .scene-formula .katex-display {",
    "    margin: 0;",
    "  }",
    "  section.scene-slide .scene-formula .katex {",
    "    font-size: 1.18em;",
    "    max-width: 100%;",
    "    font-family: 'Times New Roman', serif;",
    "  }",
    "  section.scene-slide .scene-formula .katex .mathnormal,",
    "  section.scene-slide .scene-formula .katex .mathit {",
    "    font-family: 'Times New Roman', serif;",
    "    font-style: italic;",
    "  }",
    "  section.scene-slide .scene-formula .katex .mathrm,",
    "  section.scene-slide .scene-formula .katex .mord.text {",
    "    font-family: 'Times New Roman', serif;",
    "    font-style: normal;",
    "  }",
    "  section.scene-slide .scene-formula .math-fit {",
    "    display: flex;",
    "    justify-content: center;",
    "    max-width: 100%;",
    "  }",
    "  section.scene-slide .scene-formula .math-fit-md .katex {",
    "    font-size: 1.02em;",
    "  }",
    "  section.scene-slide .scene-formula .math-fit-sm .katex {",
    "    font-size: 0.88em;",
    "  }",
    "  @keyframes scene-step-fade {",
    "    from { opacity: 0; transform: translateY(8px); }",
    "    to { opacity: 1; transform: translateY(0); }",
    "  }",
    "  @media print {",
    "    section.scene-slide .scene-layer,",
    "    section.scene-slide .scene-step-note,",
    "    section.scene-slide .scene-formula {",
    "      animation: none !important;",
    "      transform: none !important;",
    "    }",
    "    section.scene-slide .scene-layer {",
    "      opacity: 0;",
    "    }",
    "    section.scene-slide .scene-layer:last-child,",
    "    section.scene-slide .scene-step-note,",
    "    section.scene-slide .scene-formula {",
    "      opacity: 1;",
    "    }",
    "  }",
    ...KATEX_CSS.split("\n").map((line) => `  ${line}`),
    "---",
  ].join("\n");
}

function visualSlide(visual: VisualAsset): string {
  const label = VISUAL_TYPE_LABELS[visual.type] ?? "図";
  const svgContent = visual.svg_content ?? "";
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

  return [
    "<!-- _class: visual-slide -->",
    `## 図解: ${label}`,
    "",
    '<div class="visual-frame">',
    `  <img src="${dataUri}" alt="${escapeHtmlAttr(label)}" />`,
    "</div>",
  ].join("\n");
}

function sceneSlide(
  visual: VisualAsset,
  spec: TriangleSpec | null,
  model: MeaningModel,
  scene: DiagramScene,
  index: number,
  total: number
): string {
  const label = VISUAL_TYPE_LABELS[visual.type] ?? "図";
  const imageLayers = scene.steps.map((step, stepIndex) =>
    sceneLayerSvg(label, model, spec, step, stepIndex)
  ).join("\n");
  const notes = scene.steps.map((step, stepIndex) =>
    `<div class="scene-step-note" style="--step-index:${stepIndex}"><p>${escapeHtmlText(step.narration)}</p></div>`
  ).join("\n");
  const formulas = scene.steps
    .map((step, stepIndex) => step.formula ? formulaBlock(step.formula, stepIndex) : "")
    .filter(Boolean)
    .join("\n");

  return [
    "<!-- _class: scene-slide -->",
    `## 図解 ${index + 1}/${total}: ${escapeHtmlText(scene.title)}`,
    "",
    `<div class="scene-visual">${imageLayers}</div>`,
    "",
    '<div class="scene-notes">',
    notes,
    "</div>",
    formulas ? `<div class="scene-formulas">${formulas}</div>` : "",
  ].filter(Boolean).join("\n");
}

function visualSlides(visual: VisualAsset, explanation: Explanation): string[] {
  if (visual.type !== "right_triangle_specific" && visual.type !== "triangle") {
    return [visualSlide(visual)];
  }

  const model = parseMeaningModel(visual.spec_json);
  if (!model) return [visualSlide(visual)];

  const spec = model.diagram_type === "right_triangle"
    ? buildTriangleSpecFromModel(model)
    : null;
  const plan = buildPresentationPlanFromMeaningModel(model, explanation.solution_result);
  if (model.diagram_type === "right_triangle" && !spec) return [visualSlide(visual)];
  if (!plan) return [visualSlide(visual)];

  return plan.scenes.map((scene, index) =>
    sceneSlide(visual, spec, model, scene, index, plan.scenes.length)
  );
}

function fallbackSlide(explanation: Explanation): string {
  return [
    "<!-- _class: visual-slide -->",
    "## 図解を生成できませんでした",
    "",
    escapeHtmlText(explanation.problem_summary),
  ].join("\n");
}

/**
 * Explanation と VisualAsset[] から Marp Markdown を生成する純粋関数。
 * 解析情報は制作メタデータとして扱い、スライド本文には段階図解だけを出す。
 */
export function generateMarpMarkdown(
  explanation: Explanation,
  theme: string = "default",
  visuals: VisualAsset[] = []
): string {
  const generatedVisuals = visuals.filter(
    (v) => v.status === "generated" && v.svg_content
  );

  const slides: string[] = [frontMatter(theme)];

  for (const visual of generatedVisuals) {
    slides.push(...visualSlides(visual, explanation));
  }

  if (slides.length === 1) {
    slides.push(fallbackSlide(explanation));
  }

  return slides.join(SLIDE_SEPARATOR);
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseMeaningModel(value: unknown): MeaningModel | null {
  if (!isRecord(value)) return null;
  if (value.diagram_type !== "right_triangle" && value.diagram_type !== "triangle") {
    return null;
  }
  return value as unknown as MeaningModel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sceneLayerSvg(
  label: string,
  model: MeaningModel,
  spec: TriangleSpec | null,
  step: DiagramSceneStep,
  stepIndex: number
): string {
  const svgStep = step.formula ? { ...step, formula: null } : step;
  const svgContent = model.diagram_type === "right_triangle" && spec
    ? generateRightTriangleSpecificSvg(spec, { frame: svgStep })
    : generateGeneralTriangleSvg(model, { frame: svgStep });
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

  return `<div class="scene-layer" style="--step-index:${stepIndex}"><img src="${dataUri}" alt="${escapeHtmlAttr(label)}" /></div>`;
}

function formulaBlock(formula: string, stepIndex: number): string {
  return `<div class="scene-formula" style="--step-index:${stepIndex}">${formulaToHtml(formula)}</div>`;
}
