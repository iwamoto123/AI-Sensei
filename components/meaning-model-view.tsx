import type { MeaningModel } from "@/lib/types";

interface Props {
  model: MeaningModel;
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "高", color: "text-green-700 dark:text-green-400" },
  medium: { label: "中", color: "text-yellow-700 dark:text-yellow-400" },
  low: { label: "低", color: "text-red-700 dark:text-red-400" },
};

const TARGET_LABELS: Record<string, string> = {
  base: "底辺",
  height: "高さ",
  hypotenuse: "斜辺",
  angle: "角度",
};

export function MeaningModelView({ model }: Props) {
  const conf = CONFIDENCE_LABELS[model.confidence] ?? CONFIDENCE_LABELS.low;

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-800">
      <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-400">
        図意味モデル
        <span className={`ml-2 ${conf.color}`}>
          confidence: {conf.label}
        </span>
        {model.safe_to_render_specific_labels ? (
          <span className="ml-2 text-green-600">specific</span>
        ) : (
          <span className="ml-2 text-zinc-400">generic fallback</span>
        )}
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <span className="font-medium">givens:</span>
          {model.givens.length === 0 && (
            <span className="ml-1 text-zinc-400">なし</span>
          )}
          <ul className="ml-3 list-disc">
            {model.givens.map((g, i) => (
              <li key={i}>
                {TARGET_LABELS[g.target] ?? g.target} = {g.value}
                {g.unit === "degree" ? "°" : g.unit}
                <span className="ml-1 text-zinc-400">({g.kind})</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="font-medium">unknown:</span>
          {model.unknown ? (
            <span className="ml-1">
              {TARGET_LABELS[model.unknown.target]} → &quot;{model.unknown.label}&quot;
            </span>
          ) : (
            <span className="ml-1 text-zinc-400">なし</span>
          )}
        </div>
        {model.highlight_target && (
          <div>
            <span className="font-medium">highlight:</span>
            <span className="ml-1 text-red-600">
              {TARGET_LABELS[model.highlight_target]}
            </span>
          </div>
        )}
        {model.trig_relation && (
          <div>
            <span className="font-medium">trig:</span>
            <span className="ml-1">
              {model.trig_relation.fn}({model.trig_relation.angle_value}°) ={" "}
              {TARGET_LABELS[model.trig_relation.numerator]}/
              {TARGET_LABELS[model.trig_relation.denominator]}
            </span>
          </div>
        )}
        {model.context_labels.length > 0 && (
          <div>
            <span className="font-medium">context:</span>
            {model.context_labels.map((c, i) => (
              <span key={i} className="ml-1">
                {TARGET_LABELS[c.target]}=&quot;{c.label}&quot;
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
