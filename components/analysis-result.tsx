import type { Explanation } from "@/lib/types";

interface Props {
  explanation: Explanation;
}

const sections: { key: keyof Explanation; label: string }[] = [
  { key: "problem_summary", label: "問題の要約" },
  { key: "topic", label: "単元" },
  { key: "solution_outline", label: "解法の流れ" },
  { key: "why_this_method", label: "解法の理由" },
  { key: "common_pitfalls", label: "つまずきやすいポイント" },
];

export function AnalysisResult({ explanation }: Props) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">解析結果</h2>
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
    </div>
  );
}
