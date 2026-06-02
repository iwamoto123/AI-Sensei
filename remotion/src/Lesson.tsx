import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "katex/dist/katex.min.css";
import type { LessonIR } from "./ir/types";
import { buildModel } from "./ir/timeline";
import { resolveTheme } from "./theme";
import { ProblemCard } from "./components/ProblemCard";
import { EquationStack } from "./components/EquationStack";
import { Callout } from "./components/Callout";
import { AnswerBadge } from "./components/AnswerBadge";
import { Bullets } from "./components/Bullets";
import { SceneChip } from "./components/SceneChip";

const FADE = 8;

const Fade: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE, Math.max(FADE, durationInFrames - FADE), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Lesson: React.FC<{ ir: LessonIR }> = ({ ir }) => {
  const { fps } = useVideoConfig();
  const theme = resolveTheme(ir.design);
  const model = buildModel(ir, fps);

  const layer = (start: number, end: number, node: React.ReactNode, key: string) => {
    const len = Math.max(1, end - start);
    return (
      <Sequence key={key} from={start} durationInFrames={len} layout="none">
        <Fade durationInFrames={len}>{node}</Fade>
      </Sequence>
    );
  };

  return (
    <AbsoluteFill style={{ background: theme.background, fontFamily: theme.fontFamily }}>
      {/* scene chip */}
      {model.chips.map((c, i) =>
        layer(c.start, c.end, <SceneChip title={c.title} palette={theme.palette} />, `chip-${i}`)
      )}

      {/* problem cards */}
      {model.problemCards.map((c, i) =>
        layer(c.start, c.end, <ProblemCard title={c.title} items={c.items} palette={theme.palette} />, `pc-${i}`)
      )}

      {/* equation stacks */}
      {model.stacks.map((st, i) =>
        layer(st.start, st.end, <EquationStack stack={st} palette={theme.palette} />, `eq-${i}`)
      )}

      {/* notes */}
      {model.notes.map((n, i) =>
        layer(n.start, n.end, <Callout text={n.text} palette={theme.palette} />, `note-${i}`)
      )}

      {/* answers */}
      {model.answers.map((a, i) =>
        layer(a.start, a.end, <AnswerBadge tex={a.tex} role={a.role} palette={theme.palette} />, `ans-${i}`)
      )}

      {/* bullets */}
      {model.bullets.map((b, i) =>
        layer(b.start, b.end, <Bullets items={b.items} palette={theme.palette} />, `bul-${i}`)
      )}

      {/* narration audio (音声ファースト同期) */}
      {model.audioClips.map((clip, i) => (
        <Sequence key={`aud-${i}`} from={clip.start} durationInFrames={clip.durationInFrames} layout="none">
          <Audio src={staticFile(clip.src)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
