import type {
  DiagramSceneFrame,
  DiagramScenePlan,
  DiagramTarget,
  MeaningModel,
  MeaningModelGiven,
  SolutionResult,
} from "@/lib/types";

export function buildScenePlanFromMeaningModel(
  model: MeaningModel,
  solutionResult: SolutionResult | null = null
): DiagramScenePlan | null {
  switch (model.diagram_type) {
    case "right_triangle":
      return buildRightTriangleScenePlan(model, solutionResult);
    case "triangle":
      return buildGeneralTriangleScenePlan(model, solutionResult);
    default:
      return null;
  }
}

function buildRightTriangleScenePlan(
  model: MeaningModel,
  solutionResult: SolutionResult | null
): DiagramScenePlan | null {
  const frames: DiagramSceneFrame[] = [];
  const visibleTargets = new Set<string>();

  frames.push({
    id: "setup",
    title: "図の状況を整理",
    narration: "問題の状況を直角三角形として整理します。",
    visible_targets: [],
    highlight_target: null,
    formula: null,
  });

  const angle = model.givens.find(
    (given) => given.kind === "angle" && given.target === "angle"
  );
  if (angle) {
    visibleTargets.add("angle");
    frames.push({
      id: "show-angle",
      title: "角度を確認",
      narration: `角度は ${angle.value}${formatUnit(angle.unit)} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: "angle",
      formula: null,
    });
  }

  for (const given of model.givens.filter(isLengthGiven)) {
    visibleTargets.add(given.target);
    frames.push({
      id: `show-given-${given.target}`,
      title: `${targetLabel(given.target)}を確認`,
      narration: `${targetLabel(given.target)}は ${given.value}${formatUnit(given.unit)} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: given.target,
      formula: null,
    });
  }

  if (model.unknown) {
    visibleTargets.add(model.unknown.target);
    frames.push({
      id: `show-unknown-${model.unknown.target}`,
      title: "求める値を確認",
      narration: `求めるのは ${model.unknown.label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: model.unknown.target,
      formula: null,
    });
  }

  if (model.trig_relation) {
    frames.push({
      id: "show-relation",
      title: "三角比の関係を使う",
      narration: `${model.trig_relation.fn} は ${targetLabel(model.trig_relation.numerator)} と ${targetLabel(model.trig_relation.denominator)} の比です。`,
      visible_targets: [...visibleTargets],
      highlight_target: model.unknown?.target ?? model.trig_relation.numerator,
      formula: formatTrigRelation(model),
    });
  }

  if (frames.length <= 1) return null;

  frames.push({
    id: "final",
    title: "図の対応を確認",
    narration: "既知の値と求める値の対応を図で確認します。",
    visible_targets: ["angle", "base", "height", "hypotenuse"],
    highlight_target: model.highlight_target,
    formula: model.trig_relation ? formatTrigRelation(model) : null,
  });

  if (solutionResult) {
    for (const [index, step] of solutionResult.calculation_steps.entries()) {
      frames.push({
        id: `calculate-${index + 1}`,
        title: `計算 ${index + 1}`,
        narration: step.narration,
        visible_targets: ["angle", "base", "height", "hypotenuse"],
        highlight_target: model.unknown?.target ?? model.highlight_target,
        formula: step.formula,
      });
    }

    frames.push({
      id: "answer",
      title: "答え",
      narration: `答えは ${solutionResult.final_answer} です。`,
      visible_targets: ["angle", "base", "height", "hypotenuse"],
      highlight_target: model.unknown?.target ?? model.highlight_target,
      formula: `答え: ${solutionResult.final_answer}`,
    });
  }

  return {
    diagram_type: "right_triangle",
    frames,
  };
}

function buildGeneralTriangleScenePlan(
  model: MeaningModel,
  solutionResult: SolutionResult | null
): DiagramScenePlan | null {
  const frames: DiagramSceneFrame[] = [];
  const visibleTargets = new Set<string>();

  frames.push({
    id: "setup",
    title: "図の状況を整理",
    narration: "問題の三角形で、角と辺の対応を整理します。",
    visible_targets: [],
    highlight_target: null,
    formula: null,
  });

  for (const vertex of model.triangle_vertices ?? []) {
    if (!vertex.angle_label) continue;
    visibleTargets.add(vertex.id);
    frames.push({
      id: `show-angle-${vertex.id}`,
      title: `${vertex.label} の角を確認`,
      narration: `${vertex.label} の角は ${vertex.angle_label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: vertex.id,
      formula: null,
    });
  }

  for (const side of model.triangle_sides ?? []) {
    if (!side.value_label && !side.is_unknown) continue;
    visibleTargets.add(side.id);
    frames.push({
      id: `show-side-${side.id}`,
      title: `${side.label} を確認`,
      narration: side.is_unknown
        ? `求めるのは ${side.label} です。`
        : `${side.label} は ${side.value_label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: side.id,
      formula: null,
    });
  }

  frames.push({
    id: "relation",
    title: "関係式を立てる",
    narration: "角と辺の対応から、解答で使う関係式を確認します。",
    visible_targets: allGeneralTriangleTargets(model),
    highlight_target: model.highlight_target,
    formula: model.relation_label ?? null,
  });

  if (solutionResult) {
    for (const [index, step] of solutionResult.calculation_steps.entries()) {
      frames.push({
        id: `calculate-${index + 1}`,
        title: `計算 ${index + 1}`,
        narration: step.narration,
        visible_targets: allGeneralTriangleTargets(model),
        highlight_target: model.highlight_target,
        formula: step.formula,
      });
    }

    frames.push({
      id: "answer",
      title: "答え",
      narration: `答えは ${solutionResult.final_answer} です。`,
      visible_targets: allGeneralTriangleTargets(model),
      highlight_target: model.highlight_target,
      formula: `答え: ${solutionResult.final_answer}`,
    });
  }

  if (frames.length <= 1) return null;

  return {
    diagram_type: "triangle",
    frames,
  };
}

function isLengthGiven(
  given: MeaningModelGiven
): given is MeaningModelGiven & { target: DiagramTarget } {
  return given.kind === "length" && given.target !== "angle";
}

function formatTrigRelation(model: MeaningModel): string | null {
  const relation = model.trig_relation;
  if (!relation) return null;
  return `${relation.fn}${relation.angle_value}° = ${targetLabel(relation.numerator)} / ${targetLabel(relation.denominator)}`;
}

function targetLabel(target: DiagramTarget): string {
  switch (target) {
    case "base":
      return "底辺";
    case "height":
      return "高さ";
    case "hypotenuse":
      return "斜辺";
  }
}

function formatUnit(unit: string): string {
  return unit === "degree" ? "°" : unit;
}

function allGeneralTriangleTargets(model: MeaningModel): string[] {
  return [
    ...(model.triangle_vertices ?? []).map((vertex) => vertex.id),
    ...(model.triangle_sides ?? []).map((side) => side.id),
  ];
}
