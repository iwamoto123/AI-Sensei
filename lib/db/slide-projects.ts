import { getSupabase } from "@/lib/supabase";
import type { SlideProject, SlideProjectStatus } from "@/lib/types";

export async function upsertSlideProject(
  jobId: string,
  marpMarkdown: string,
  themeName: string = "default"
): Promise<SlideProject> {
  const { data, error } = await getSupabase()
    .from("slide_projects")
    .upsert(
      {
        job_id: jobId,
        marp_markdown: marpMarkdown,
        theme_name: themeName,
        status: "generated" as SlideProjectStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" }
    )
    .select()
    .single();

  if (error)
    throw new Error(`Failed to save slide project: ${error.message}`);
  return data as SlideProject;
}

export async function updateSlideProjectStatus(
  jobId: string,
  status: SlideProjectStatus
): Promise<void> {
  const { error } = await getSupabase()
    .from("slide_projects")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("job_id", jobId);

  if (error)
    throw new Error(`Failed to update slide project status: ${error.message}`);
}

export async function getSlideProjectByJobId(
  jobId: string
): Promise<SlideProject | null> {
  const { data, error } = await getSupabase()
    .from("slide_projects")
    .select()
    .eq("job_id", jobId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get slide project: ${error.message}`);
  }
  return data as SlideProject;
}
