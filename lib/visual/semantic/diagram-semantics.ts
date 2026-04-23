import type {
  TriangleSpec,
  HighlightTarget,
  MeaningModel,
  DiagramTarget,
} from "@/lib/types";

const EDGE_FALLBACK_LABELS: Record<DiagramTarget, string> = {
  base: "底辺",
  height: "高さ",
  hypotenuse: "斜辺",
};

/**
 * MeaningModel → TriangleSpec に変換する。
 * renderer はこの TriangleSpec だけを参照して描画する。
 *
 * safe_to_render_specific_labels = false の場合は、
 * 安全な一般ラベルにフォールバックする。
 */
export function buildTriangleSpecFromModel(
  model: MeaningModel
): TriangleSpec | null {
  if (model.diagram_type !== "right_triangle") return null;

  if (!model.safe_to_render_specific_labels) {
    return buildGenericFallbackSpec(model);
  }

  const angleGiven = model.givens.find(
    (g) => g.kind === "angle" && g.target === "angle"
  );
  const angleLabel = angleGiven ? `${angleGiven.value}°` : "θ";

  const baseLabel = buildEdgeLabel(model, "base");
  const heightLabel = buildEdgeLabel(model, "height");
  const hypotenuseLabel = buildEdgeLabel(model, "hypotenuse");

  const highlightTarget: HighlightTarget = isDiagramTarget(model.highlight_target)
    ? model.highlight_target
    : null;

  return {
    diagram_type: "right_triangle",
    angle_label: angleLabel,
    base_label: baseLabel,
    height_label: heightLabel,
    hypotenuse_label: hypotenuseLabel,
    highlight_target: highlightTarget,
  };
}

function isDiagramTarget(value: unknown): value is DiagramTarget {
  return value === "base" || value === "height" || value === "hypotenuse";
}

function buildEdgeLabel(model: MeaningModel, target: DiagramTarget): string {
  // 1. givens から既知の辺を探す
  const given = model.givens.find(
    (g) => g.kind === "length" && g.target === target
  );
  if (given) {
    const sourceHasValue = /\d/.test(given.source_text);
    const rawLabel =
      given.source_text.length > 15
        ? EDGE_FALLBACK_LABELS[target]
        : given.source_text;
    const baseLabel = normalizeEdgeLabel(rawLabel, given.value, given.unit);

    return sourceHasValue
      ? baseLabel
      : `${baseLabel} ${given.value}${given.unit}`;
  }

  // 2. unknown ならラベルのみ（値を置かない）
  if (model.unknown?.target === target) {
    return model.unknown.label;
  }

  // 3. context_labels を確認
  const ctx = model.context_labels.find((c) => c.target === target);
  if (ctx) return ctx.label;

  // 4. フォールバック
  return EDGE_FALLBACK_LABELS[target];
}

/**
 * confidence が low の場合のフォールバック。
 * 角度が取れていれば角度だけ specific に、辺は generic にする。
 */
function buildGenericFallbackSpec(model: MeaningModel): TriangleSpec | null {
  const angleGiven = model.givens.find(
    (g) => g.kind === "angle" && g.target === "angle"
  );

  // 角度すら取れなければ null → 汎用図へ
  if (!angleGiven) return null;

  return {
    diagram_type: "right_triangle",
    angle_label: `${angleGiven.value}°`,
    base_label: EDGE_FALLBACK_LABELS.base,
    height_label: EDGE_FALLBACK_LABELS.height,
    hypotenuse_label: EDGE_FALLBACK_LABELS.hypotenuse,
    highlight_target: isDiagramTarget(model.highlight_target)
      ? model.highlight_target
      : null,
  };
}

function normalizeEdgeLabel(label: string, value: number, unit: string): string {
  return label
    .replace(/\s+/g, " ")
    .replace(new RegExp(`(\\D)(が|は|を|で)\\s*${value}\\s*${unit}`), `$1 ${value}${unit}`)
    .replace(new RegExp(`^(.*?)(が|は|を|で)\\s*${value}\\s*${unit}$`), `$1 ${value}${unit}`)
    .trim();
}
