import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { Role } from "../ir/types";
import { Equation } from "./Equation";

interface Props {
  tex: string;
  role: Role;
  palette: Record<Role, string>;
}

export const AnswerBadge: React.FC<Props> = ({ tex, role, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(s, [0, 1], [0.85, 1]);
  const opacity = interpolate(s, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ transform: `scale(${scale})`, opacity, textAlign: "center" }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: palette[role], marginBottom: 18, letterSpacing: 4 }}>
          答え
        </div>
        <div
          style={{
            border: `3px solid ${palette[role]}`,
            borderRadius: 16,
            padding: "28px 56px",
            background: "#ffffff",
          }}
        >
          <Equation tex={tex} palette={palette} roleSpans={[{ tokens: [tex], role }]} fontSize={58} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
