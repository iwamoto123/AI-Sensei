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
import { getPublicUrl } from "@/lib/storage/upload";
import { generateMarpMarkdown } from "@/lib/marp/generate";
import { convertMarkdownToHtml } from "@/lib/marp/convert";
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
    const markdown = generateMarpMarkdown(explanation);
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
