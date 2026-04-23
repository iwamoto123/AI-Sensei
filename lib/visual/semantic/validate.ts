import type {
  MeaningModel,
  MeaningModelConfidence,
  TrigRelation,
  DiagramTarget,
} from "@/lib/types";
import {
  TRIG_PATTERN_RE,
  TRIG_EDGE_MAP,
  type TrigFn,
} from "@/lib/visual/semantic/vocabulary";
import type { Explanation } from "@/lib/types";

/**
 * MeaningModel に対して:
 * 1. テキストから三角関数の関係を検出して trig_relation を設定
 * 2. givens/unknown の整合性を検証
 * 3. confidence を判定
 * 4. safe_to_render_specific_labels を決定
 */
export function validateAndEnrich(
  model: MeaningModel,
  explanation: Explanation
): MeaningModel {
  const text = [
    explanation.problem_summary,
    explanation.solution_outline,
    explanation.why_this_method,
  ].join(" ");

  // 1. trig relation 検出
  const trigRelation = detectTrigRelation(text, model) ?? model.trig_relation;

  // 2. confidence 判定
  const confidence = assessConfidence(model, trigRelation);

  // 3. highlight_target の整合性チェック
  const highlight_target = validateHighlight(model);

  // 4. safe_to_render
  const safe_to_render_specific_labels = confidence !== "low";

  return {
    ...model,
    trig_relation: trigRelation,
    confidence,
    highlight_target,
    safe_to_render_specific_labels,
  };
}

/**
 * テキストから "tan30°", "sin45°" 等を検出し、
 * それが meaning model の辺と整合するか確認する。
 */
function detectTrigRelation(
  text: string,
  model: MeaningModel
): TrigRelation | null {
  const re = new RegExp(TRIG_PATTERN_RE.source, TRIG_PATTERN_RE.flags);
  const match = re.exec(text);
  if (!match) return null;

  const fn = match[1].toLowerCase() as TrigFn;
  const angleValue = Number(match[2]);
  const edgeMap = TRIG_EDGE_MAP[fn];

  // 角度 given と一致するか
  const angleGiven = model.givens.find(
    (g) => g.kind === "angle" && g.target === "angle"
  );
  if (angleGiven && angleGiven.value !== angleValue) return null;

  return {
    fn,
    angle_value: angleValue,
    numerator: edgeMap.numerator as DiagramTarget,
    denominator: edgeMap.denominator as DiagramTarget,
  };
}

/**
 * confidence 判定:
 * - high: angle given + 1以上の length given + unknown 特定 + trig 整合
 * - medium: angle given + unknown 特定（trig なしでも OK）
 * - low: それ以外
 */
function assessConfidence(
  model: MeaningModel,
  trigRelation: TrigRelation | null
): MeaningModelConfidence {
  const hasAngle = model.givens.some((g) => g.kind === "angle");
  const hasLength = model.givens.some((g) => g.kind === "length");
  const hasUnknown = model.unknown !== null;

  if (hasAngle && hasLength && hasUnknown && trigRelation) {
    // trig relation の numerator/denominator が unknown/given と整合するか
    const unknownTarget = model.unknown!.target;
    const givenTargets = model.givens
      .filter((g) => g.kind === "length")
      .map((g) => g.target as string);

    const trigTargets: string[] = [trigRelation.numerator, trigRelation.denominator];
    const unknownInTrig = trigTargets.includes(unknownTarget);
    const givenInTrig = givenTargets.some((t) => trigTargets.includes(t));

    if (unknownInTrig && givenInTrig) return "high";
  }

  if (hasAngle && hasUnknown) return "medium";

  return "low";
}

/**
 * highlight_target が unknown と一致することを保証する。
 * 不一致の場合は unknown の target に修正。
 */
function validateHighlight(model: MeaningModel): DiagramTarget | null {
  if (!model.unknown) return null;
  return model.unknown.target;
}
