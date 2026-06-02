import React from "react";
import { interpolate } from "remotion";
import type { Role } from "../ir/types";
import { Equation } from "./Equation";

interface Props {
  delta: number; // この行が出現してからの経過フレーム
  common: string; // 共通因数（例: "(2x-3)"）
  rest: string; // くくった残り（例: "(2a+3x)"）
  palette: Record<Role, string>;
  fontSize: number;
}

/**
 * 「色以外の表現」実験その1: 共通因数のくくり出しを“組み立て”で見せる。
 * 1) 共通因数 (2x-3) が上の行から降りてくる＋緑の枠で出現
 * 2) 少し遅れて残り (2a+3x) がフェードイン
 */
export const FactorAssemble: React.FC<Props> = ({ delta, common, rest, palette, fontSize }) => {
  const commonIn = interpolate(delta, [0, 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const commonDy = interpolate(delta, [0, 16], [-46, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const restIn = interpolate(delta, [20, 38], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          opacity: commonIn,
          transform: `translateY(${commonDy}px)`,
          border: `2.5px solid ${palette.result}`,
          borderRadius: 10,
          padding: "2px 8px",
          background: `${palette.result}14`,
        }}
      >
        <Equation tex={common} roleSpans={[{ tokens: [common], role: "result" }]} palette={palette} fontSize={fontSize} />
      </span>
      <span style={{ opacity: restIn }}>
        <Equation tex={rest} palette={palette} fontSize={fontSize} />
      </span>
    </span>
  );
};
