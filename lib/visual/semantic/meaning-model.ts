import type {
  MeaningModel,
  MeaningModelGiven,
  MeaningModelUnknown,
  MeaningModelContextLabel,
  DiagramTarget,
} from "@/lib/types";
import type { SemanticRole } from "@/lib/visual/semantic/vocabulary";
import type { SemanticExtraction } from "@/lib/visual/semantic/extract";

const ROLE_TO_TARGET: Record<Exclude<SemanticRole, "angle">, DiagramTarget> = {
  horizontal_distance: "base",
  vertical_distance: "height",
  slope_distance: "hypotenuse",
};

/**
 * SemanticExtraction から MeaningModel を構築する。
 * validation と confidence 判定は別層（validate.ts）で行う。
 */
export function buildMeaningModel(
  extraction: SemanticExtraction
): MeaningModel {
  const { quantities, seekTarget, contextLabel } = extraction;

  // givens: 値を持つ量
  const givens: MeaningModelGiven[] = quantities
    .filter((q) => q.isKnown)
    .map((q) => ({
      kind: q.role === "angle" ? ("angle" as const) : ("length" as const),
      target: q.role === "angle" ? ("angle" as const) : ROLE_TO_TARGET[q.role],
      value: q.value!,
      unit: q.unit!,
      source_text: q.source_text,
    }));

  // unknown: 値を持たない量のうち、seekTarget と一致するもの優先
  let unknown: MeaningModelUnknown | null = null;
  if (seekTarget && seekTarget !== "angle") {
    const seekQ = quantities.find((q) => q.role === seekTarget && !q.isKnown);
    unknown = {
      kind: "length",
      target: ROLE_TO_TARGET[seekTarget],
      label: seekQ?.label ?? targetToDefaultLabel(ROLE_TO_TARGET[seekTarget]),
    };
  } else {
    // seekTarget が決まらない場合: 最初の未知量を使う
    const firstUnknown = quantities.find((q) => !q.isKnown && q.role !== "angle");
    if (firstUnknown) {
      unknown = {
        kind: "length",
        target: ROLE_TO_TARGET[firstUnknown.role as Exclude<SemanticRole, "angle">],
        label: firstUnknown.label,
      };
    }
  }

  // context_labels
  const context_labels: MeaningModelContextLabel[] = [];
  if (contextLabel) {
    const ctxRole = contextLabel.role === "horizontal_distance"
      ? "base"
      : contextLabel.role === "vertical_distance"
        ? "height"
        : "hypotenuse";

    context_labels.push({ target: ctxRole, label: contextLabel.label });
  }

  // highlight_target = unknown の target
  const highlight_target: DiagramTarget | null = unknown?.target ?? null;

  return {
    diagram_type: "right_triangle",
    givens,
    unknown,
    context_labels,
    highlight_target,
    trig_relation: null, // validate.ts で設定
    confidence: "low",   // validate.ts で設定
    safe_to_render_specific_labels: false, // validate.ts で設定
  };
}

function targetToDefaultLabel(target: DiagramTarget): string {
  switch (target) {
    case "base": return "底辺";
    case "height": return "高さ";
    case "hypotenuse": return "斜辺";
  }
}
