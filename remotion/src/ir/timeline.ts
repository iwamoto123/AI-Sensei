import type { LessonIR, Role, RoleSpan, SceneKind } from "./types";

const DEFAULT_STEP_SEC = 4;
/** ナレーション末尾と次stepの間に置く“間”。 */
const TAIL_PAD_SEC = 0.5;

export interface EqLine {
  tex: string;
  roleSpans: RoleSpan[];
  relation?: string;
  frame: number;
  isAnswer?: boolean;
  factor?: { common: string; rest: string };
  migrate?: { common: string; rest: string; srcId: string };
  label?: string;
}

export interface EqStack {
  id: string;
  lines: EqLine[];
  highlights: { frame: number; role: Role; style: string }[];
  start: number;
  end: number;
}

export interface CardLayer {
  kind: "problem_card";
  title: string;
  items: string[];
  start: number;
  end: number;
}

export interface NoteLayer {
  kind: "note";
  text: string;
  start: number;
  end: number;
}

export interface AnswerLayer {
  kind: "answer";
  tex: string;
  role: Role;
  start: number;
  end: number;
}

export interface BulletsLayer {
  kind: "bullets";
  items: string[];
  start: number;
  end: number;
}

export interface SceneChip {
  title: string;
  start: number;
  end: number;
}

export interface AudioClip {
  src: string;
  start: number;
  durationInFrames: number;
}

export interface Model {
  fps: number;
  totalFrames: number;
  chips: SceneChip[];
  problemCards: CardLayer[];
  stacks: EqStack[];
  notes: NoteLayer[];
  answers: AnswerLayer[];
  bullets: BulletsLayer[];
  audioClips: AudioClip[];
}

const CLEARING_KINDS: SceneKind[] = ["answer", "takeaway", "summary"];

export function buildModel(ir: LessonIR, fps: number): Model {
  // 1. assign absolute frames to every step
  let cursor = 0;
  const sceneSpans: { kind: SceneKind; title: string; start: number; end: number }[] = [];
  const stepStarts: { sceneIdx: number; start: number }[][] = [];
  const audioClips: AudioClip[] = [];

  ir.scenes.forEach((scene, sIdx) => {
    const sceneStart = cursor;
    const starts: { sceneIdx: number; start: number }[] = [];
    scene.steps.forEach((step) => {
      const stepStart = cursor;
      starts.push({ sceneIdx: sIdx, start: stepStart });
      if (step.audio) {
        // 音声ファースト: 実尺でフレームを確保し、末尾に “間” を足す
        const audioFrames = Math.max(1, Math.round(step.audio.duration_sec * fps));
        audioClips.push({ src: step.audio.file, start: stepStart, durationInFrames: audioFrames });
        cursor += audioFrames + Math.round(TAIL_PAD_SEC * fps);
      } else {
        const sec = step.duration_hint_sec ?? DEFAULT_STEP_SEC;
        cursor += Math.max(1, Math.round(sec * fps));
      }
    });
    stepStarts.push(starts);
    sceneSpans.push({ kind: scene.kind, title: scene.title ?? "", start: sceneStart, end: cursor });
  });
  const totalFrames = Math.max(cursor, fps);

  const firstClearingAfter = (frame: number): number => {
    const found = sceneSpans.find((s) => CLEARING_KINDS.includes(s.kind) && s.start >= frame);
    return found ? found.start : totalFrames;
  };

  // 2. walk ops to build layers
  const stacks = new Map<string, EqStack>();
  const problemCards: CardLayer[] = [];
  const notes: NoteLayer[] = [];
  const answers: AnswerLayer[] = [];
  const bullets: BulletsLayer[] = [];

  ir.scenes.forEach((scene, sIdx) => {
    const span = sceneSpans[sIdx];
    scene.steps.forEach((step, stIdx) => {
      const at = stepStarts[sIdx][stIdx].start;
      for (const v of step.visual) {
        switch (v.op) {
          case "show_problem_card":
            problemCards.push({ kind: "problem_card", title: v.title, items: v.items, start: at, end: span.end });
            break;
          case "show_expression":
            stacks.set(v.id, {
              id: v.id,
              lines: [{ tex: v.tex, roleSpans: v.role_spans ?? [], frame: at }],
              highlights: [],
              start: at,
              end: totalFrames,
            });
            break;
          case "append_equation_line": {
            const st = stacks.get(v.target);
            if (st) {
              st.lines.push({
                tex: v.tex,
                roleSpans: v.role_spans ?? [],
                relation: v.relation,
                frame: at,
                isAnswer: v.is_answer,
                label: v.label,
              });
            }
            break;
          }
          case "emphasize_token": {
            const st = stacks.get(v.target);
            if (st && st.lines[0]) {
              st.lines[0].roleSpans.push({ tokens: v.tokens, role: v.role });
            }
            break;
          }
          case "factor_out": {
            const st = stacks.get(v.target);
            if (st) {
              st.lines.push({
                tex: v.tex,
                roleSpans: [],
                relation: "=",
                frame: at,
                isAnswer: true,
                factor: { common: v.common, rest: v.rest },
              });
            }
            break;
          }
          case "factor_migrate": {
            const st = stacks.get(v.target);
            if (st) {
              st.lines.push({
                tex: v.tex,
                roleSpans: [],
                relation: "=",
                frame: at,
                isAnswer: true,
                migrate: { common: v.common, rest: v.rest, srcId: v.src_id },
                label: v.label,
              });
            }
            break;
          }
          case "highlight": {
            const st = stacks.get(v.target);
            if (st) st.highlights.push({ frame: at, role: v.role ?? "result", style: v.style ?? "wavy_underline" });
            break;
          }
          case "show_note":
          case "show_callout":
            notes.push({ kind: "note", text: v.text, start: at, end: span.end });
            break;
          case "show_answer":
            answers.push({ kind: "answer", tex: v.tex, role: v.role ?? "result", start: span.start, end: span.end });
            break;
          case "show_bullets":
            bullets.push({ kind: "bullets", items: v.items, start: span.start, end: span.end });
            break;
          default:
            break;
        }
      }
    });
  });

  // 3. finalize equation-stack visible windows
  for (const st of stacks.values()) {
    st.end = firstClearingAfter(st.start);
  }

  const chips: SceneChip[] = sceneSpans
    .filter((s) => s.title)
    .map((s) => ({ title: s.title, start: s.start, end: s.end }));

  return {
    fps,
    totalFrames,
    chips,
    problemCards,
    stacks: [...stacks.values()],
    notes,
    answers,
    bullets,
    audioClips,
  };
}

export function computeTotalFrames(ir: LessonIR, fps: number): number {
  return buildModel(ir, fps).totalFrames;
}
