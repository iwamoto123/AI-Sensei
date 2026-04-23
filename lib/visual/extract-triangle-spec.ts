import type { Explanation, TriangleSpec, MeaningModel } from "@/lib/types";
import { extractSemantics } from "@/lib/visual/semantic/extract";
import { buildMeaningModel } from "@/lib/visual/semantic/meaning-model";
import { validateAndEnrich } from "@/lib/visual/semantic/validate";
import { buildTriangleSpecFromModel } from "@/lib/visual/semantic/diagram-semantics";

export interface TriangleExtractionResult {
  meaningModel: MeaningModel;
  spec: TriangleSpec | null;
}

/**
 * explanation → extraction → meaning model → validation → TriangleSpec
 *
 * 4層パイプライン:
 * 1. Semantic Extraction: テキストから量を抽出
 * 2. MeaningModel Construction: givens/unknown/context を構造化
 * 3. Validation: trig整合性チェック、confidence 判定
 * 4. Rendering Spec: MeaningModel → TriangleSpec（SVG入力）
 *
 * MeaningModel は常に返す（UI表示・デバッグ用）。
 * TriangleSpec は判定が十分な場合のみ返す。
 */
export function extractTriangleWithModel(
  explanation: Explanation
): TriangleExtractionResult {
  if (explanation.visual_model?.diagram_type === "right_triangle") {
    const model = validateAndEnrich(explanation.visual_model, explanation);
    const spec = buildTriangleSpecFromModel(model);
    return { meaningModel: model, spec };
  }

  const extraction = extractSemantics(explanation);
  const rawModel = buildMeaningModel(extraction);
  const model = validateAndEnrich(rawModel, explanation);
  const spec = buildTriangleSpecFromModel(model);

  return { meaningModel: model, spec };
}

/**
 * 後方互換: TriangleSpec のみを返す。
 * detect.ts や generate.ts で使用。
 */
export function extractTriangleSpec(
  explanation: Explanation
): TriangleSpec | null {
  return extractTriangleWithModel(explanation).spec;
}
