export type Role = "neutral" | "focus" | "group" | "result" | "accent";

export interface RoleSpan {
  tokens: string[];
  role: Role;
}

export type VisualOp =
  | { op: "show_problem_card"; title: string; items: string[] }
  | { op: "show_expression"; id: string; tex: string; role_spans?: RoleSpan[] }
  | {
      op: "append_equation_line";
      target: string;
      relation?: string;
      tex: string;
      role_spans?: RoleSpan[];
      is_answer?: boolean;
      partial?: boolean;
      label?: string;
    }
  | { op: "emphasize_token"; target: string; tokens: string[]; role: Role }
  | { op: "factor_out"; target: string; common: string; rest: string; tex: string }
  | { op: "factor_migrate"; target: string; common: string; rest: string; src_id: string; tex: string; label?: string }
  | {
      op: "highlight";
      target: string;
      span: string;
      style?: "wavy_underline" | "box" | "color";
      role?: Role;
    }
  | { op: "show_note"; text: string }
  | { op: "show_callout"; text: string }
  | { op: "show_title"; text: string }
  | { op: "show_answer"; tex: string; role?: Role }
  | { op: "show_bullets"; items: string[] };

export interface StepAudio {
  /** publicDir からの相対パス（staticFile で解決） */
  file: string;
  duration_sec: number;
}

export interface Step {
  id: string;
  narration: string;
  duration_hint_sec?: number;
  visual: VisualOp[];
  audio?: StepAudio;
}

export type SceneKind =
  | "intro"
  | "principle"
  | "question"
  | "approach"
  | "solution"
  | "answer"
  | "takeaway"
  | "summary";

export interface Scene {
  id: string;
  kind: SceneKind;
  title?: string;
  steps: Step[];
}

export interface LessonDesign {
  theme?: "light" | "dark";
  background?: string;
  palette?: Partial<Record<Role, string>>;
}

export interface LessonIR {
  schema_version: string;
  format?: string;
  meta: Record<string, unknown> & { title?: string; problem?: string };
  design?: LessonDesign;
  scenes: Scene[];
}
