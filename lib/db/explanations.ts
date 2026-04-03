import { getSupabase } from "@/lib/supabase";
import type { Explanation } from "@/lib/types";
import type { AnalysisResult } from "@/lib/analysis/analyze";

export async function upsertExplanation(
  jobId: string,
  result: AnalysisResult
): Promise<Explanation> {
  const { data, error } = await getSupabase()
    .from("explanations")
    .upsert(
      {
        job_id: jobId,
        ...result,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" }
    )
    .select()
    .single();

  if (error)
    throw new Error(`Failed to save explanation: ${error.message}`);
  return data as Explanation;
}

export async function getExplanationByJobId(
  jobId: string
): Promise<Explanation | null> {
  const { data, error } = await getSupabase()
    .from("explanations")
    .select()
    .eq("job_id", jobId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get explanation: ${error.message}`);
  }
  return data as Explanation;
}
