import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Role } from "../ir/types";

interface Props {
  items: string[];
  palette: Record<Role, string>;
}

export const Bullets: React.FC<Props> = ({ items, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1000 }}>
        {items.map((text, i) => {
          const appear = spring({ frame: frame - i * 12, fps, config: { damping: 200 } });
          const opacity = interpolate(appear, [0, 1], [0, 1]);
          const dx = interpolate(appear, [0, 1], [-20, 0]);
          return (
            <div
              key={i}
              style={{ opacity, transform: `translateX(${dx}px)`, display: "flex", gap: 18, alignItems: "center" }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: palette.accent,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 36, fontWeight: 700, color: palette.neutral }}>{text}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
