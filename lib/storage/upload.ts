import { getSupabase } from "@/lib/supabase";

const BUCKETS = {
  problem_image: "problem-images",
  answer_image: "answer-images",
} as const;

export type BucketType = keyof typeof BUCKETS;

export async function uploadImage(
  type: BucketType,
  jobId: string,
  file: File
): Promise<string> {
  const bucket = BUCKETS[type];
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${jobId}/${type}.${ext}`;

  const { error } = await getSupabase().storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error(`Failed to upload ${type}: ${error.message}`);
  return path;
}

export function getPublicUrl(type: BucketType, path: string): string {
  const bucket = BUCKETS[type];
  const { data } = getSupabase().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
