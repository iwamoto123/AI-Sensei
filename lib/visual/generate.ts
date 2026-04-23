import type { Explanation, VisualAssetType, TriangleSpec, MeaningModel } from "@/lib/types";
import { detectNeededVisuals } from "@/lib/visual/detect";
import { extractTriangleWithModel } from "@/lib/visual/extract-triangle-spec";
import { generateFunctionGraphSvg } from "@/lib/visual/svg/function-graph";
import { generateNumberLineSvg } from "@/lib/visual/svg/number-line";
import { generateTriangleSvg } from "@/lib/visual/svg/triangle";
import { generateRightTriangleSpecificSvg } from "@/lib/visual/svg/right-triangle-specific";
import { generateGeneralTriangleSvg } from "@/lib/visual/svg/general-triangle";

export interface GeneratedVisual {
  type: VisualAssetType;
  svgContent: string;
  spec: TriangleSpec | null;
  meaningModel: MeaningModel | null;
}

export interface VisualGenerationResult {
  generated: GeneratedVisual[];
  failed: { type: VisualAssetType; error: string }[];
}

/**
 * explanation から必要な図を判定し、SVG を生成する。
 * right_triangle_specific の場合:
 *   extraction → meaning model → validation → TriangleSpec → SVG
 * MeaningModel は常に保存（デバッグ・UI表示用）。
 */
export function generateVisualsForExplanation(
  explanation: Explanation
): VisualGenerationResult {
  const neededTypes = detectNeededVisuals(explanation);

  const generated: GeneratedVisual[] = [];
  const failed: { type: VisualAssetType; error: string }[] = [];

  for (const type of neededTypes) {
    try {
      if (type === "right_triangle_specific") {
        const { meaningModel, spec } = extractTriangleWithModel(explanation);
        if (!spec) throw new Error("三角形スペックの構築に失敗（confidence不足）");
        const svgContent = generateRightTriangleSpecificSvg(spec);
        generated.push({ type, svgContent, spec, meaningModel });
      } else if (type === "triangle" && explanation.visual_model?.diagram_type === "triangle") {
        const svgContent = generateGeneralTriangleSvg(explanation.visual_model);
        generated.push({
          type,
          svgContent,
          spec: null,
          meaningModel: explanation.visual_model,
        });
      } else {
        const svgContent = generateGenericSvg(type);
        generated.push({ type, svgContent, spec: null, meaningModel: null });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "SVG生成に失敗しました";
      failed.push({ type, error: message });
    }
  }

  return { generated, failed };
}

function generateGenericSvg(type: VisualAssetType): string {
  switch (type) {
    case "function_graph":
      return generateFunctionGraphSvg();
    case "number_line":
      return generateNumberLineSvg();
    case "triangle":
      return generateTriangleSvg();
    default:
      throw new Error(`Unknown visual type: ${type}`);
  }
}
