import { getSupabase } from "@/lib/supabase";
import type {
  VisualAsset,
  VisualAssetType,
  VisualAssetStatus,
  TriangleSpec,
  MeaningModel,
} from "@/lib/types";

export async function upsertVisualAsset(
  jobId: string,
  type: VisualAssetType,
  status: VisualAssetStatus,
  svgContent: string | null = null,
  errorMessage: string | null = null,
  specJson: MeaningModel | TriangleSpec | null = null
): Promise<VisualAsset> {
  const existing = await getVisualAsset(jobId, type);

  if (existing) {
    const { data, error } = await getSupabase()
      .from("visual_assets")
      .update({
        status,
        svg_content: svgContent,
        error_message: errorMessage,
        spec_json: specJson,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to update visual asset: ${error.message}`);
    return data as VisualAsset;
  }

  const { data, error } = await getSupabase()
    .from("visual_assets")
    .insert({
      job_id: jobId,
      type,
      status,
      svg_content: svgContent,
      error_message: errorMessage,
      spec_json: specJson,
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create visual asset: ${error.message}`);
  return data as VisualAsset;
}

export async function getVisualAsset(
  jobId: string,
  type: VisualAssetType
): Promise<VisualAsset | null> {
  const { data, error } = await getSupabase()
    .from("visual_assets")
    .select()
    .eq("job_id", jobId)
    .eq("type", type)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get visual asset: ${error.message}`);
  }
  return data as VisualAsset;
}

export async function getVisualAssetsByJobId(
  jobId: string
): Promise<VisualAsset[]> {
  const { data, error } = await getSupabase()
    .from("visual_assets")
    .select()
    .eq("job_id", jobId);

  if (error)
    throw new Error(`Failed to get visual assets: ${error.message}`);
  return (data as VisualAsset[]) ?? [];
}
