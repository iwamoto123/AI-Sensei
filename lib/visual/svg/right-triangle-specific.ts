import type { DiagramSceneFrame, TriangleSpec } from "@/lib/types";

type RightTriangleTarget = "angle" | "base" | "height" | "hypotenuse";

export interface RightTriangleSvgOptions {
  frame?: DiagramSceneFrame;
}

/**
 * TriangleSpec をもとに問題固有の直角三角形 SVG を生成する。
 * 左下に直角、底辺が水平、高さが垂直、斜辺が左下→右上方向。
 * highlight_target で指定された辺を赤で強調する。
 */
export function generateRightTriangleSpecificSvg(
  spec: TriangleSpec,
  options: RightTriangleSvgOptions = {}
): string {
  const w = 480;
  const h = 360;
  const pad = 60;
  const frame = options.frame;
  const visibleTargets = frame ? new Set(frame.visible_targets) : null;
  const highlightTarget = frame?.highlight_target ?? spec.highlight_target;

  // 三角形の頂点: A=左下(直角), B=右下, C=左上
  const ax = pad;
  const ay = h - pad;
  const bx = w - pad;
  const by = h - pad;
  const cx = pad;
  const cy = pad + 20;

  const sq = 20; // 直角マークサイズ

  const normal = "#2563eb";
  const highlight = "#dc2626";
  const normalWidth = "2";
  const highlightWidth = "3.5";

  function edgeStyle(target: "base" | "height" | "hypotenuse") {
    const isHL = highlightTarget === target;
    return {
      stroke: isHL ? highlight : normal,
      width: isHL ? highlightWidth : normalWidth,
      dash: isHL ? "" : "",
    };
  }

  function isVisible(target: RightTriangleTarget): boolean {
    return !visibleTargets || visibleTargets.has(target);
  }

  const base = edgeStyle("base");
  const height = edgeStyle("height");
  const hyp = edgeStyle("hypotenuse");

  // 角度弧（B点 = 右下から角度を描画）
  const arcR = 36;
  // B→A 方向は左（180°）、B→C 方向は左上
  const arcEndX = bx - arcR * 0.87; // cos(30°) 近似
  const arcEndY = by - arcR * 0.5;  // sin(30°) 近似

  // ラベルのテキストが長い場合にフォントサイズを調整
  const labelSize = (text: string) => (text.length > 8 ? "11" : "13");
  const formula = frame?.formula;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#fff;border-radius:8px;">
  <!-- 三角形の面 -->
  <polygon points="${ax},${ay} ${bx},${by} ${cx},${cy}" fill="#eff6ff" stroke="none"/>

  <!-- 底辺 (A→B) -->
  <line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${base.stroke}" stroke-width="${base.width}"/>
  <!-- 高さ (A→C) -->
  <line x1="${ax}" y1="${ay}" x2="${cx}" y2="${cy}" stroke="${height.stroke}" stroke-width="${height.width}"/>
  <!-- 斜辺 (B→C) -->
  <line x1="${bx}" y1="${by}" x2="${cx}" y2="${cy}" stroke="${hyp.stroke}" stroke-width="${hyp.width}"/>

  <!-- 直角マーク -->
  <polyline points="${ax + sq},${ay} ${ax + sq},${ay - sq} ${ax},${ay - sq}" fill="none" stroke="${normal}" stroke-width="1.5"/>

  ${isVisible("angle") ? `<!-- 角度弧 (B点) -->
  <path d="M ${bx - arcR},${by} A ${arcR},${arcR} 0 0,0 ${arcEndX.toFixed(1)},${arcEndY.toFixed(1)}" fill="none" stroke="${highlightTarget === "angle" ? highlight : normal}" stroke-width="1.5"/>
  <text x="${bx - arcR - 8}" y="${by - 12}" font-size="14" fill="${highlightTarget === "angle" ? highlight : normal}" font-weight="bold">${escapeSvgText(spec.angle_label)}</text>` : ""}

  ${isVisible("base") ? `<!-- 底辺ラベル -->
  <text x="${(ax + bx) / 2}" y="${ay + 28}" text-anchor="middle" font-size="${labelSize(spec.base_label)}" fill="${base.stroke}" font-weight="bold">${escapeSvgText(spec.base_label)}</text>` : ""}

  ${isVisible("height") ? `<!-- 高さラベル -->
  <text x="${ax - 26}" y="${(ay + cy) / 2}" text-anchor="end" dominant-baseline="middle" font-size="${labelSize(spec.height_label)}" fill="${height.stroke}" font-weight="bold">${escapeSvgText(spec.height_label)}</text>` : ""}

  ${isVisible("hypotenuse") ? `<!-- 斜辺ラベル -->
  <text x="${(bx + cx) / 2 + 16}" y="${(by + cy) / 2 - 4}" text-anchor="start" font-size="${labelSize(spec.hypotenuse_label)}" fill="${hyp.stroke}" font-weight="bold">${escapeSvgText(spec.hypotenuse_label)}</text>` : ""}

  ${formula ? `<text x="${w / 2}" y="${h - 26}" text-anchor="middle" font-size="15" fill="#111827" font-weight="bold">${escapeSvgText(formula)}</text>` : ""}
  ${highlightTarget ? `<text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-size="11" fill="${highlight}">赤い部分に注目</text>` : ""}
</svg>`;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
