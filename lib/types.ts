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
  solution_result: SolutionResult | null;
  visual_model: MeaningModel | null;
  model_name: string | null;
  created_at: string;
  updated_at: string;
}

export type SlideProjectStatus = "generating" | "generated" | "failed";

export type HtmlStatus = "generating" | "generated" | "failed";

export interface SlideProject {
  id: string;
  job_id: string;
  marp_markdown: string;
  theme_name: string;
  status: SlideProjectStatus;
  html_content: string | null;
  html_status: HtmlStatus | null;
  html_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type VisualAssetType =
  | "function_graph"
  | "number_line"
  | "triangle"
  | "right_triangle_specific";

export type VisualAssetStatus =
  | "pending"
  | "generating"
  | "generated"
  | "failed";

export interface VisualAsset {
  id: string;
  job_id: string;
  type: VisualAssetType;
  status: VisualAssetStatus;
  spec_json: MeaningModel | TriangleSpec | null;
  svg_content: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// --- TriangleSpec (rendering layer) ---

export type HighlightTarget = "base" | "height" | "hypotenuse" | null;

export interface TriangleSpec {
  diagram_type: "right_triangle";
  angle_label: string;
  base_label: string;
  height_label: string;
  hypotenuse_label: string;
  highlight_target: HighlightTarget;
}

// --- MeaningModel (semantic layer) ---

export type DiagramTarget = "base" | "height" | "hypotenuse";

export interface MeaningModelGiven {
  kind: "length" | "angle";
  target: DiagramTarget | "angle";
  value: number;
  unit: string;
  source_text: string;
}

export interface MeaningModelUnknown {
  kind: "length";
  target: DiagramTarget;
  label: string;
}

export interface MeaningModelContextLabel {
  target: DiagramTarget | "angle";
  label: string;
}

export interface TrigRelation {
  fn: "sin" | "cos" | "tan";
  angle_value: number;
  numerator: DiagramTarget;
  denominator: DiagramTarget;
}

export interface TriangleVertexModel {
  id: string;
  label: string;
  angle_label: string | null;
}

export interface TriangleSideModel {
  id: string;
  from: string;
  to: string;
  label: string;
  value_label: string | null;
  is_unknown: boolean;
}

export type MeaningModelConfidence = "high" | "medium" | "low";

export interface MeaningModel {
  diagram_type: "right_triangle" | "triangle";
  givens: MeaningModelGiven[];
  unknown: MeaningModelUnknown | null;
  context_labels: MeaningModelContextLabel[];
  highlight_target: string | null;
  trig_relation: TrigRelation | null;
  confidence: MeaningModelConfidence;
  safe_to_render_specific_labels: boolean;
  triangle_vertices?: TriangleVertexModel[];
  triangle_sides?: TriangleSideModel[];
  relation_label?: string | null;
}

// --- SolutionResult (calculation layer) ---

export interface CalculationStep {
  formula: string;
  narration: string;
}

export interface SolutionResult {
  calculation_steps: CalculationStep[];
  final_answer: string;
  answer_unit: string | null;
}

// --- DiagramScenePlan (presentation layer) ---

export interface DiagramSceneFrame {
  id: string;
  title: string;
  narration: string;
  visible_targets: string[];
  highlight_target: string | null;
  formula: string | null;
}

export interface DiagramScenePlan {
  diagram_type: MeaningModel["diagram_type"];
  frames: DiagramSceneFrame[];
}
