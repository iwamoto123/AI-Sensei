import React, { useEffect, useRef, useState } from "react";
import { interpolate } from "remotion";
import type { Role } from "../ir/types";
import { Equation } from "./Equation";

interface Props {
  delta: number; // この行が出現してからの経過フレーム
  common: string; // 前に出す共通因数（例: "(2x-3)"）
  rest: string; // くくった残り（例: "(2a+3x)"）
  srcId: string; // 上の行の共通因数につけた htmlId
  palette: Record<Role, string>;
  fontSize: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/** transform の影響を受けない“レイアウト上の”相対位置を offsetParent 連鎖で求める。 */
function offsetWithin(el: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * 「色以外の表現」実験: 最終行の共通因数を、上の行の同じ (2x-3) の位置から
 * 現在の定位置まで実際にスライドさせる。残りは到着後にフェードイン。
 */
export const FactorMigrationLine: React.FC<Props> = ({
  delta,
  common,
  rest,
  srcId,
  palette,
  fontSize,
  containerRef,
}) => {
  const homeRef = useRef<HTMLSpanElement>(null);
  const [geo, setGeo] = useState<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    const src = document.getElementById(srcId);
    const home = homeRef.current;
    if (root && src && home) {
      const s = offsetWithin(src, root);
      const h = offsetWithin(home, root);
      setGeo({ dx: s.x - h.x, dy: s.y - h.y });
    }
  }, [containerRef, srcId]);

  // フレーム配分（30fps想定）
  const M_START = 38;
  const M_END = 74;
  const REST_START = 70;
  const REST_END = 94;

  // p=1: 上の行(src)の位置 / p=0: 定位置(home)
  const p = interpolate(delta, [M_START, M_END], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const appear = interpolate(delta, [M_START - 8, M_START], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const restOpacity = interpolate(delta, [REST_START, REST_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const tx = geo ? geo.dx * p : 0;
  const ty = geo ? geo.dy * p : 0;

  // 上の行の共通因数とまったく同じ見た目（白地・緑枠）にして「同じものが降りてきた」感を出す
  const boxedCommon = `\\fcolorbox{${palette.result}}{#ffffff}{$\\textcolor{${palette.result}}{${common}}$}`;

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <span style={{ position: "relative", display: "inline-block" }}>
        {/* 定位置の幅を確保するための不可視アンカー（測位用） */}
        <span ref={homeRef} style={{ visibility: "hidden" }}>
          <Equation tex={boxedCommon} palette={palette} fontSize={fontSize} />
        </span>
        {/* 実際にスライドしてくる共通因数（上の行の枠と同一スタイル） */}
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            opacity: appear,
            transform: `translate(${tx}px, ${ty}px)`,
            whiteSpace: "nowrap",
          }}
        >
          <Equation tex={boxedCommon} palette={palette} fontSize={fontSize} />
        </span>
      </span>
      <span style={{ opacity: restOpacity, marginLeft: 4 }}>
        <Equation tex={rest} palette={palette} fontSize={fontSize} />
      </span>
    </span>
  );
};
