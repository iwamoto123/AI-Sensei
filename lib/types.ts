export type JobStatus = "uploaded" | "analyzing" | "analyzed" | "failed";

export type AssetType = "problem_image" | "answer_image";

export interface Job {
  id: string;
  status: JobStatus;
  subject: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  job_id: string;
  type: AssetType;
  path: string;
  created_at: string;
}

export interface Explanation {
  id: string;
  job_id: string;
  problem_summary: string;
  topic: string;
  solution_outline: string;
  why_this_method: string;
  common_pitfalls: string;
  model_name: string | null;
  created_at: string;
  updated_at: string;
}
