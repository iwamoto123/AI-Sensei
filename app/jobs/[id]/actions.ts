"use server";

import { revalidatePath } from "next/cache";
import { analyzeJob } from "@/lib/analysis/analyze";
import { updateJobStatus } from "@/lib/db/jobs";
import { getAssetsByJobId } from "@/lib/db/assets";
import { upsertExplanation } from "@/lib/db/explanations";
import { getPublicUrl } from "@/lib/storage/upload";
import type { AssetType } from "@/lib/types";

export interface AnalyzeState {
  error?: string;
}

export async function runAnalysis(
  _prevState: AnalyzeState,
  formData: FormData
): Promise<AnalyzeState> {
  const jobId = formData.get("jobId") as string;
  if (!jobId) return { error: "Job ID が見つかりません。" };

  try {
    await updateJobStatus(jobId, "analyzing");

    // 画像URLを取得
    const assets = await getAssetsByJobId(jobId);
    const problemAsset = assets.find((a) => a.type === "problem_image");
    const answerAsset = assets.find((a) => a.type === "answer_image");

    if (!problemAsset || !answerAsset) {
      throw new Error("問題画像または解答画像が見つかりません。");
    }

    const problemImageUrl = getPublicUrl(
      "problem_image" as AssetType,
      problemAsset.path
    );
    const answerImageUrl = getPublicUrl(
      "answer_image" as AssetType,
      answerAsset.path
    );

    // AI解析実行
    const result = await analyzeJob(jobId, {
      problemImageUrl,
      answerImageUrl,
    });

    // 結果を保存（既存があれば上書き）
    await upsertExplanation(jobId, result);

    await updateJobStatus(jobId, "analyzed");
  } catch (e) {
    console.error("[Analysis failed]", e);
    await updateJobStatus(jobId, "failed").catch(() => {});
    const message =
      e instanceof Error ? e.message : "解析に失敗しました。";
    return { error: message };
  }

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
