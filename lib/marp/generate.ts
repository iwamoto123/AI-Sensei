import type {
  DiagramSceneFrame,
  Explanation,
  MeaningModel,
  TriangleSpec,
  VisualAsset,
} from "@/lib/types";
import { buildTriangleSpecFromModel } from "@/lib/visual/semantic/diagram-semantics";
import { buildScenePlanFromMeaningModel } from "@/lib/visual/scene/plan";
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
    "    grid-template-rows: auto 1fr;",
    "    gap: 0.7rem;",
    "  }",
    "  section.scene-slide h2 {",
    "    margin-bottom: 0;",
    "  }",
    "  section.scene-slide {",
    "    grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.8fr);",
    "    grid-template-rows: auto minmax(0, 1fr) auto;",
    "    align-items: stretch;",
    "  }",
    "  section.scene-slide .scene-image {",
    "    grid-column: 1;",
    "    grid-row: 2 / 4;",
    "    align-self: center;",
    "    justify-self: center;",
    "    max-width: 100%;",
    "    max-height: 74vh;",
    "    object-fit: contain;",
    "  }",
    "  section.scene-slide .scene-notes {",
    "    grid-column: 2;",
    "    grid-row: 2;",
    "    align-self: end;",
    "    border-left: 4px solid #2563eb;",
    "    padding-left: 1rem;",
    "    text-align: left;",
    "  }",
    "  section.scene-slide .scene-notes p {",
    "    font-size: 1.08rem;",
    "    line-height: 1.62;",
    "  }",
    "  section.scene-slide .scene-formula {",
    "    grid-column: 2;",
    "    grid-row: 3;",
    "    align-self: start;",
    "    margin: 1rem 0 0 0 !important;",
    "    padding: 0.75rem 0.9rem;",
    "    border: 1px solid #dbeafe;",
    "    border-radius: 8px;",
    "    background: #f8fafc;",
    "    overflow: hidden;",
    "    font-size: 1.08rem;",
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

function sceneFrameSlide(
  visual: VisualAsset,
  spec: TriangleSpec | null,
  model: MeaningModel,
  frame: DiagramSceneFrame,
  index: number,
  total: number
): string {
  const label = VISUAL_TYPE_LABELS[visual.type] ?? "図";
  const svgFrame = frame.formula ? { ...frame, formula: null } : frame;
  const svgContent = model.diagram_type === "right_triangle" && spec
    ? generateRightTriangleSpecificSvg(spec, { frame: svgFrame })
    : generateGeneralTriangleSvg(model, { frame: svgFrame });
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  const formula = frame.formula ? formulaBlock(frame.formula) : "";

  return [
    "<!-- _class: scene-slide -->",
    `## 図解 ${index + 1}/${total}: ${escapeHtmlText(frame.title)}`,
    "",
    `<img class="scene-image" src="${dataUri}" alt="${escapeHtmlAttr(label)}" />`,
    "",
    '<div class="scene-notes">',
    `  <p>${escapeHtmlText(frame.narration)}</p>`,
    "</div>",
    formula,
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
  const plan = buildScenePlanFromMeaningModel(model, explanation.solution_result);
  if (model.diagram_type === "right_triangle" && !spec) return [visualSlide(visual)];
  if (!plan) return [visualSlide(visual)];

  return plan.frames.map((frame, index) =>
    sceneFrameSlide(visual, spec, model, frame, index, plan.frames.length)
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

function formulaBlock(formula: string): string {
  return `<div class="scene-formula">${formulaToHtml(formula)}</div>`;
}
