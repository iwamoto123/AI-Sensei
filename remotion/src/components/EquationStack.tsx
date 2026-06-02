import React, { useRef } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { Role } from "../ir/types";
import type { EqStack } from "../ir/timeline";
import { Equation } from "./Equation";
import { FactorAssemble } from "./FactorAssemble";
import { FactorMigrationLine } from "./FactorMigrationLine";

interface Props {
  stack: EqStack;
  palette: Record<Role, string>;
}

/** 数式を縦に積み、各行を出現フレームでフェード／スライドイン。行数に応じてフォントを自動縮小。 */
export const EquationStack: React.FC<Props> = ({ stack, palette }) => {
  const frame = useCurrentFrame();
  const local = frame + stack.start; // restore absolute frame
  const containerRef = useRef<HTMLDivElement>(null);

  const n = stack.lines.length;
  const fontSize = n >= 5 ? 32 : n >= 4 ? 36 : 42;
  const gap = n >= 5 ? 14 : 16;

  const activeHighlight = stack.highlights.filter((h) => local >= h.frame).at(-1);
  const highlightLineIdx = activeHighlight
    ? stack.lines.reduce((acc, l, i) => (l.frame <= activeHighlight.frame ? i : acc), 0)
    : -1;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        ref={containerRef}
        style={{ position: "relative", display: "flex", flexDirection: "column", gap, alignItems: "flex-start" }}
      >
        {stack.lines.map((line, i) => {
          const delta = local - line.frame;
          const shown = delta >= 0;
          const opacity = shown ? interpolate(delta, [0, 10], [0, 1], { extrapolateRight: "clamp" }) : 0;
          const dy = interpolate(delta, [0, 12], [14, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isHi = shown && i === highlightLineIdx;
          const hiColor = activeHighlight ? palette[activeHighlight.role] : palette.result;
          const labelOpacity = interpolate(delta, [8, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={i}
              style={{
                position: "relative",
                opacity,
                transform: `translateY(${dy}px)`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "4px 0",
                // 行全体を塗りつぶすのではなく、左に細い縦バーだけ添える控えめな強調
                borderLeft: isHi ? `4px solid ${hiColor}` : "4px solid transparent",
                paddingLeft: 12,
              }}
            >
              {line.relation ? (
                <span style={{ fontSize: fontSize - 4, color: palette.neutral, minWidth: 24 }}>
                  {line.relation}
                </span>
              ) : (
                <span style={{ minWidth: i === 0 ? 0 : 24 }} />
              )}
              {line.migrate ? (
                <FactorMigrationLine
                  delta={delta}
                  common={line.migrate.common}
                  rest={line.migrate.rest}
                  srcId={line.migrate.srcId}
                  palette={palette}
                  fontSize={fontSize + 2}
                  containerRef={containerRef}
                />
              ) : line.factor ? (
                <FactorAssemble
                  delta={delta}
                  common={line.factor.common}
                  rest={line.factor.rest}
                  palette={palette}
                  fontSize={fontSize + 2}
                />
              ) : (
                <Equation
                  tex={line.tex}
                  roleSpans={line.roleSpans}
                  palette={palette}
                  fontSize={line.isAnswer ? fontSize + 4 : fontSize}
                />
              )}
              {line.label ? (
                <span
                  style={{
                    position: "absolute",
                    left: "100%",
                    marginLeft: 40,
                    whiteSpace: "nowrap",
                    opacity: labelOpacity,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#6b7280",
                    fontSize: 22,
                    fontWeight: 600,
                  }}
                >
                  <span style={{ width: 22, height: 2, background: "#d1d5db" }} />
                  {line.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
