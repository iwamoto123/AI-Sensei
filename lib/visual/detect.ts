import type { Explanation, VisualAssetType } from "@/lib/types";
import { extractTriangleSpec } from "@/lib/visual/extract-triangle-spec";

/**
 * 判定ルール:
 * - 問題固有三角形: 三角比/傾斜系キーワード + extractTriangleSpec が成功
 * - 汎用三角形: 三角キーワードあるが固有スペック抽出失敗（フォールバック）
 * - 関数グラフ: 関数/グラフ系キーワード
 * - 数直線: 不等式/範囲系キーワード
 */

const TRIANGLE_KEYWORDS = ["三角", "三角比", "三角形", "sin", "cos", "tan", "傾斜", "角度"];
const FUNCTION_KEYWORDS = ["関数", "グラフ", "放物線", "二次関数", "一次関数", "最大値", "最小値"];
const NUMBER_LINE_KEYWORDS = ["不等式", "範囲", "定義域", "値域", "数直線", "区間"];

export function detectNeededVisuals(
  explanation: Explanation
): VisualAssetType[] {
  const text = [
    explanation.topic,
    explanation.problem_summary,
    explanation.solution_outline,
  ].join(" ");

  const results: VisualAssetType[] = [];

  if (explanation.visual_model?.diagram_type === "triangle") {
    results.push("triangle");
    return results;
  }

  if (explanation.visual_model?.diagram_type === "right_triangle") {
    results.push("right_triangle_specific");
    return results;
  }

  // 三角形系: まず問題固有を試み、失敗なら汎用にフォールバック
  if (TRIANGLE_KEYWORDS.some((kw) => text.includes(kw))) {
    const spec = extractTriangleSpec(explanation);
    if (spec) {
      results.push("right_triangle_specific");
    } else {
      results.push("triangle");
    }
  }

  if (FUNCTION_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push("function_graph");
  }

  if (NUMBER_LINE_KEYWORDS.some((kw) => text.includes(kw))) {
    results.push("number_line");
  }

  return results;
}
