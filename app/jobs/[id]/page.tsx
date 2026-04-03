import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/db/jobs";
import { getAssetsByJobId } from "@/lib/db/assets";
import { getExplanationByJobId } from "@/lib/db/explanations";
import { getPublicUrl } from "@/lib/storage/upload";
import { AnalyzeButton } from "@/components/analyze-button";
import { AnalysisResult } from "@/components/analysis-result";
import type { AssetType, JobStatus } from "@/lib/types";

interface Props {
  params: Promise<{ id: string }>;
}

const ASSET_LABELS: Record<AssetType, string> = {
  problem_image: "問題画像",
  answer_image: "解答画像",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  uploaded: "アップロード済み",
  analyzing: "解析中",
  analyzed: "解析済み",
  failed: "解析失敗",
};

const STATUS_COLORS: Record<JobStatus, string> = {
  uploaded: "bg-zinc-100 dark:bg-zinc-800",
  analyzing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  analyzed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const [assets, explanation] = await Promise.all([
    getAssetsByJobId(id),
    getExplanationByJobId(id),
  ]);

  const showAnalyzeButton = job.status === "uploaded" || job.status === "failed";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div>
        <Link
          href="/new"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          ← 新規作成に戻る
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
          ジョブ詳細
        </h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
          <span>Job ID: {job.id}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}
          >
            {STATUS_LABELS[job.status]}
          </span>
        </div>
      </div>

      {/* 画像表示 */}
      <div className="grid gap-6 sm:grid-cols-2">
        {(["problem_image", "answer_image"] as const).map((type) => {
          const asset = assets.find((a) => a.type === type);
          if (!asset) return null;
          const url = getPublicUrl(type, asset.path);
          return (
            <section
              key={type}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <h2 className="mb-3 text-sm font-medium">
                {ASSET_LABELS[type]}
              </h2>
              <img
                src={url}
                alt={ASSET_LABELS[type]}
                className="w-full rounded-lg border border-zinc-100 object-contain dark:border-zinc-800"
              />
            </section>
          );
        })}
      </div>

      {/* 解析セクション */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        {explanation ? (
          <div className="space-y-6">
            <AnalysisResult explanation={explanation} />
            <div className="border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <AnalyzeButton jobId={id} isRerun />
            </div>
          </div>
        ) : showAnalyzeButton ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {job.status === "failed"
                ? "解析に失敗しました。再度実行してください。"
                : "ボタンを押してAI解析を実行してください。"}
            </p>
            <AnalyzeButton jobId={id} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            解析中です。しばらくお待ちください。
          </p>
        )}
      </section>
    </main>
  );
}
