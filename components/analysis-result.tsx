import type { Explanation } from "@/lib/types";

interface Props {
  explanation: Explanation;
}

const sections: { key: keyof Explanation; label: string }[] = [
  { key: "problem_summary", label: "問題の要約" },
  { key: "topic", label: "単元" },
  { key: "solution_outline", label: "解法ステップ" },
  { key: "why_this_method", label: "解法選択の根拠" },
  { key: "common_pitfalls", label: "注意点" },
];

export function AnalysisResult({ explanation }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">制作メタ情報</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          スライド本文ではなく、図解生成と検証のための内部情報です。
        </p>
      </div>
      {sections.map(({ key, label }) => (
        <section key={key}>
          <h3 className="mb-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {label}
          </h3>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {explanation[key] as string}
          </p>
        </section>
      ))}
      {explanation.solution_result && (
        <section>
          <h3 className="mb-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            計算と答え
          </h3>
          <div className="space-y-2 text-sm leading-relaxed">
            {explanation.solution_result.calculation_steps.map((step, index) => (
              <div key={`${step.formula}-${index}`}>
                <p className="font-medium">{step.formula}</p>
                <p className="text-zinc-600 dark:text-zinc-300">
                  {step.narration}
                </p>
              </div>
            ))}
            <p className="font-semibold">
              答え: {explanation.solution_result.final_answer}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
