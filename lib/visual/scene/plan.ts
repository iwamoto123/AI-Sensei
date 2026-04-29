import type {
  DiagramPresentationPlan,
  DiagramScene,
  DiagramSceneStep,
  DiagramTarget,
  MeaningModel,
  MeaningModelGiven,
  SolutionResult,
} from "@/lib/types";

export function buildPresentationPlanFromMeaningModel(
  model: MeaningModel,
  solutionResult: SolutionResult | null = null
): DiagramPresentationPlan | null {
  switch (model.diagram_type) {
    case "right_triangle":
      return buildRightTrianglePresentationPlan(model, solutionResult);
    case "triangle":
      return buildGeneralTrianglePresentationPlan(model, solutionResult);
    default:
      return null;
  }
}

function buildRightTrianglePresentationPlan(
  model: MeaningModel,
  solutionResult: SolutionResult | null
) : DiagramPresentationPlan | null {
  const scenes: DiagramScene[] = [];
  const visibleTargets = new Set<string>();
  const setupSteps: DiagramSceneStep[] = [
    {
      id: "setup",
      narration: "問題の状況を直角三角形として整理します。",
      visible_targets: [],
      highlight_target: null,
      formula: null,
    },
  ];

  const angle = model.givens.find(
    (given) => given.kind === "angle" && given.target === "angle"
  );
  if (angle) {
    visibleTargets.add("angle");
    setupSteps.push({
      id: "show-angle",
      narration: `角度は ${angle.value}${formatUnit(angle.unit)} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: "angle",
      formula: null,
    });
  }

  for (const given of model.givens.filter(isLengthGiven)) {
    visibleTargets.add(given.target);
    setupSteps.push({
      id: `show-given-${given.target}`,
      narration: `${targetLabel(given.target)}は ${given.value}${formatUnit(given.unit)} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: given.target,
      formula: null,
    });
  }

  if (model.unknown) {
    visibleTargets.add(model.unknown.target);
    setupSteps.push({
      id: `show-unknown-${model.unknown.target}`,
      narration: `求めるのは ${model.unknown.label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: model.unknown.target,
      formula: null,
    });
  }

  if (setupSteps.length <= 1) return null;

  scenes.push({
    id: "diagram-setup",
    title: "図の状況を整理",
    layout: "diagram-focus",
    steps: setupSteps,
  });

  if (model.trig_relation) {
    scenes.push({
      id: "relation",
      title: "三角比の関係を使う",
      layout: "formula-focus",
      steps: [{
        id: "show-relation",
      narration: `${model.trig_relation.fn} は ${targetLabel(model.trig_relation.numerator)} と ${targetLabel(model.trig_relation.denominator)} の比です。`,
      visible_targets: [...visibleTargets],
      highlight_target: model.unknown?.target ?? model.trig_relation.numerator,
      formula: formatTrigRelation(model),
      }],
    });
  }

  const allTargets = ["angle", "base", "height", "hypotenuse"];
  scenes.push({
    id: "diagram-summary",
    title: "図の対応を確認",
    layout: "diagram-focus",
    steps: [{
      id: "final",
      narration: "既知の値と求める値の対応を図で確認します。",
      visible_targets: allTargets,
      highlight_target: model.highlight_target,
      formula: model.trig_relation ? formatTrigRelation(model) : null,
    }],
  });

  if (solutionResult) {
    const calculationSteps: DiagramSceneStep[] = solutionResult.calculation_steps.map(
      (step, index) => ({
        id: `calculate-${index + 1}`,
        narration: step.narration,
        visible_targets: allTargets,
        highlight_target: model.unknown?.target ?? model.highlight_target,
        formula: step.formula,
      })
    );

    if (calculationSteps.length > 0) {
      scenes.push({
        id: "calculation",
        title: "計算を進める",
        layout: "formula-focus",
        steps: calculationSteps,
      });
    }

    scenes.push({
      id: "answer",
      title: "答え",
      layout: "answer-focus",
      steps: [{
        id: "answer",
        narration: `答えは ${solutionResult.final_answer} です。`,
        visible_targets: allTargets,
        highlight_target: model.unknown?.target ?? model.highlight_target,
        formula: `答え: ${solutionResult.final_answer}`,
      }],
    });
  }

  return {
    diagram_type: "right_triangle",
    scenes,
  };
}

function buildGeneralTrianglePresentationPlan(
  model: MeaningModel,
  solutionResult: SolutionResult | null
) : DiagramPresentationPlan | null {
  const scenes: DiagramScene[] = [];
  const visibleTargets = new Set<string>();
  const setupSteps: DiagramSceneStep[] = [
    {
      id: "setup",
      narration: "問題の三角形で、角と辺の対応を整理します。",
      visible_targets: [],
      highlight_target: null,
      formula: null,
    },
  ];

  const allTargets = allGeneralTriangleTargets(model);

  for (const vertex of model.triangle_vertices ?? []) {
    if (!vertex.angle_label) continue;
    visibleTargets.add(vertex.id);
    setupSteps.push({
      id: `show-angle-${vertex.id}`,
      narration: `${vertex.label} の角は ${vertex.angle_label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: vertex.id,
      formula: null,
    });
  }

  for (const side of model.triangle_sides ?? []) {
    if (!side.value_label && !side.is_unknown) continue;
    visibleTargets.add(side.id);
    setupSteps.push({
      id: `show-side-${side.id}`,
      narration: side.is_unknown
        ? `求めるのは ${side.label} です。`
        : `${side.label} は ${side.value_label} です。`,
      visible_targets: [...visibleTargets],
      highlight_target: side.id,
      formula: null,
    });
  }

  if (setupSteps.length <= 1) return null;

  scenes.push({
    id: "diagram-setup",
    title: "図の状況を整理",
    layout: "diagram-focus",
    steps: setupSteps,
  });

  scenes.push({
    id: "relation",
    title: "関係式を立てる",
    layout: "formula-focus",
    steps: [{
      id: "relation",
      narration: "角と辺の対応から、解答で使う関係式を確認します。",
      visible_targets: allTargets,
      highlight_target: model.highlight_target,
      formula: model.relation_label ?? null,
    }],
  });

  if (solutionResult) {
    const calculationSteps: DiagramSceneStep[] = solutionResult.calculation_steps.map(
      (step, index) => ({
        id: `calculate-${index + 1}`,
        narration: step.narration,
        visible_targets: allTargets,
        highlight_target: model.highlight_target,
        formula: step.formula,
      })
    );

    if (calculationSteps.length > 0) {
      scenes.push({
        id: "calculation",
        title: "計算を進める",
        layout: "formula-focus",
        steps: calculationSteps,
      });
    }

    scenes.push({
      id: "answer",
      title: "答え",
      layout: "answer-focus",
      steps: [{
        id: "answer",
        narration: `答えは ${solutionResult.final_answer} です。`,
        visible_targets: allTargets,
        highlight_target: model.highlight_target,
        formula: `答え: ${solutionResult.final_answer}`,
      }],
    });
  }

  return {
    diagram_type: "triangle",
    scenes,
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
