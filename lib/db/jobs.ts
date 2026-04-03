import { getSupabase } from "@/lib/supabase";
import type { Job, JobStatus } from "@/lib/types";

export async function createJob(): Promise<Job> {
  const { data, error } = await getSupabase()
    .from("jobs")
    .insert({ status: "uploaded", subject: "math" })
    .select()
    .single();

  if (error) throw new Error(`Failed to create job: ${error.message}`);
  return data as Job;
}

export async function getJob(id: string): Promise<Job | null> {
  const { data, error } = await getSupabase()
    .from("jobs")
    .select()
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get job: ${error.message}`);
  }
  return data as Job;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus
): Promise<void> {
  const { error } = await getSupabase()
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to update job status: ${error.message}`);
}
