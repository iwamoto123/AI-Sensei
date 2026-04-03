import { getSupabase } from "@/lib/supabase";
import type { Asset, AssetType } from "@/lib/types";

export async function createAsset(
  jobId: string,
  type: AssetType,
  path: string
): Promise<Asset> {
  const { data, error } = await getSupabase()
    .from("assets")
    .insert({ job_id: jobId, type, path })
    .select()
    .single();

  if (error) throw new Error(`Failed to create asset: ${error.message}`);
  return data as Asset;
}

export async function getAssetsByJobId(jobId: string): Promise<Asset[]> {
  const { data, error } = await getSupabase()
    .from("assets")
    .select()
    .eq("job_id", jobId);

  if (error) throw new Error(`Failed to get assets: ${error.message}`);
  return (data as Asset[]) ?? [];
}
