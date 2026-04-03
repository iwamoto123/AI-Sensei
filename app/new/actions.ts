"use server";

import { redirect } from "next/navigation";
import { createJob } from "@/lib/db/jobs";
import { createAsset } from "@/lib/db/assets";
import { uploadImage } from "@/lib/storage/upload";
import type { UploadState } from "@/components/upload-form";

export async function uploadAction(
  _prevState: UploadState,
  formData: FormData
): Promise<UploadState> {
  const problemFile = formData.get("problemImage") as File | null;
  const answerFile = formData.get("answerImage") as File | null;

  // バリデーション: ファイルが選択されているか
  if (!problemFile || problemFile.size === 0) {
    return { error: "問題画像を選択してください。" };
  }
  if (!answerFile || answerFile.size === 0) {
    return { error: "解答画像を選択してください。" };
  }

  let jobId: string;
  try {
    // 1. job レコード作成
    const job = await createJob();
    jobId = job.id;

    // 2. 画像を Storage にアップロード
    const [problemPath, answerPath] = await Promise.all([
      uploadImage("problem_image", jobId, problemFile),
      uploadImage("answer_image", jobId, answerFile),
    ]);

    // 3. assets レコード作成
    await Promise.all([
      createAsset(jobId, "problem_image", problemPath),
      createAsset(jobId, "answer_image", answerPath),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : "アップロードに失敗しました。";
    return { error: message };
  }

  redirect(`/jobs/${jobId}`);
}
