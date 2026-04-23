"use server";

import { revalidatePath } from "next/cache";
import { analyzeJob } from "@/lib/analysis/analyze";
import { updateJobStatus } from "@/lib/db/jobs";
import { getAssetsByJobId } from "@/lib/db/assets";
import { upsertExplanation, getExplanationByJobId } from "@/lib/db/explanations";
import {
  upsertSlideProject,
  getSlideProjectByJobId,
  updateHtmlContent,
  updateHtmlStatus,
} from "@/lib/db/slide-projects";
import { upsertVisualAsset, getVisualAssetsByJobId } from "@/lib/db/visual-assets";
import { getPublicUrl } from "@/lib/storage/upload";
import { generateMarpMarkdown } from "@/lib/marp/generate";
import { convertMarkdownToHtml } from "@/lib/marp/convert";
import { generateVisualsForExplanation } from "@/lib/visual/generate";
import type { AssetType } from "@/lib/types";

export interface ActionState {
  error?: string;
}

export async function runAnalysis(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId") as string;
  if (!jobId) return { error: "Job ID が見つかりません。" };

  try {
    await updateJobStatus(jobId, "analyzing");

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

    const result = await analyzeJob(jobId, {
      problemImageUrl,
      answerImageUrl,
    });

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

export async function generateVisuals(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId") as string;
  if (!jobId) return { error: "Job ID が見つかりません。" };

  const explanation = await getExplanationByJobId(jobId);
  if (!explanation) {
    return { error: "解析結果が見つかりません。先にAI解析を実行してください。" };
  }

  const result = generateVisualsForExplanation(explanation);

  if (result.generated.length === 0 && result.failed.length === 0) {
    return { error: "この問題では図の生成対象がありませんでした。" };
  }

  // 成功した図を保存（MeaningModel があればそちらを優先保存）
  for (const visual of result.generated) {
    await upsertVisualAsset(
      jobId,
      visual.type,
      "generated",
      visual.svgContent,
      null,
      visual.meaningModel ?? visual.spec
    );
  }

  // 失敗した図を記録
  for (const fail of result.failed) {
    await upsertVisualAsset(jobId, fail.type, "failed", null, fail.error);
  }

  revalidatePath(`/jobs/${jobId}`);

  if (result.failed.length > 0) {
    return {
      error: `一部の図生成に失敗しました: ${result.failed.map((f) => f.type).join(", ")}`,
    };
  }
  return {};
}

export async function generateSlides(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId") as string;
  if (!jobId) return { error: "Job ID が見つかりません。" };

  const explanation = await getExplanationByJobId(jobId);
  if (!explanation) {
    return { error: "解析結果が見つかりません。先にAI解析を実行してください。" };
  }

  try {
    // 図がある場合は差し込む
    const visuals = await getVisualAssetsByJobId(jobId);
    const markdown = generateMarpMarkdown(explanation, "default", visuals);
    await upsertSlideProject(jobId, markdown);
  } catch (e) {
    console.error("[Slide generation failed]", e);
    const message =
      e instanceof Error ? e.message : "スライド原稿の生成に失敗しました。";
    return { error: message };
  }

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function generateHtmlPreview(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId") as string;
  if (!jobId) return { error: "Job ID が見つかりません。" };

  const slideProject = await getSlideProjectByJobId(jobId);
  if (!slideProject) {
    return { error: "スライド原稿が見つかりません。先にスライド原稿を生成してください。" };
  }
  if (!slideProject.marp_markdown.trim()) {
    return { error: "Marp Markdown が空です。" };
  }

  try {
    await updateHtmlStatus(jobId, "generating");

    const html = await convertMarkdownToHtml(slideProject.marp_markdown);
    await updateHtmlContent(jobId, html);
  } catch (e) {
    console.error("[HTML generation failed]", e);
    await updateHtmlStatus(jobId, "failed").catch(() => {});
    const message =
      e instanceof Error ? e.message : "HTMLプレビューの生成に失敗しました。";
    return { error: message };
  }

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
