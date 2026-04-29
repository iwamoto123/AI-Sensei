import type { DiagramSceneStep, MeaningModel, TriangleSideModel } from "@/lib/types";

type VertexId = "A" | "B" | "C";
type Point = { x: number; y: number };

const DEFAULT_SIDES: TriangleSideModel[] = [
  { id: "a", from: "B", to: "C", label: "a", value_label: null, is_unknown: false },
  { id: "b", from: "C", to: "A", label: "b", value_label: null, is_unknown: false },
  { id: "c", from: "A", to: "B", label: "c", value_label: null, is_unknown: false },
];

export interface GeneralTriangleSvgOptions {
  frame?: DiagramSceneStep;
}

export function generateGeneralTriangleSvg(
  model: MeaningModel,
  options: GeneralTriangleSvgOptions = {}
): string {
  const w = 640;
  const h = 420;
  const diagramTop = 26;
  const diagramBottom = 302;
  const annotationTop = 326;
  const frame = options.frame;
  const visibleTargets = frame ? new Set(frame.visible_targets) : null;
  const highlightTarget = frame?.highlight_target ?? model.highlight_target;
  const sides = model.triangle_sides?.length ? model.triangle_sides : DEFAULT_SIDES;
  const vertices = model.triangle_vertices?.length
    ? model.triangle_vertices
    : [
        { id: "A", label: "A", angle_label: null },
        { id: "B", label: "B", angle_label: null },
        { id: "C", label: "C", angle_label: null },
      ];
  const points = buildTrianglePoints(model, {
    left: 84,
    right: 548,
    top: diagramTop,
    bottom: diagramBottom,
  });

  function isVisible(id: string): boolean {
    return !visibleTargets || visibleTargets.has(id);
  }

  function strokeFor(id: string): string {
    return highlightTarget === id ? "#dc2626" : "#2563eb";
  }

  function widthFor(id: string): string {
    return highlightTarget === id ? "3.5" : "2";
  }

  const sideLines = sides.map((side) => renderSide(side, points, isVisible, strokeFor, widthFor)).join("\n");
  const vertexLabels = vertices.map((vertex) => {
    const id = normalizeVertex(vertex.id);
    const point = points[id];
    const outward = unitVectorFromCentroid(point, centroid(points));
    const labelPoint = offset(point, outward, 28);
    const anglePoint = offset(point, outward, 51);
    const angleLabel = vertex.angle_label && isVisible(vertex.id)
      ? `<text x="${anglePoint.x}" y="${anglePoint.y}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${highlightTarget === vertex.id ? "#dc2626" : "#111827"}" font-weight="bold">${escapeSvgText(vertex.angle_label)}</text>`
      : "";

    return [
      `<text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="middle" font-size="13" fill="#6b7280">${escapeSvgText(vertex.label)}</text>`,
      angleLabel,
    ].join("\n");
  }).join("\n");

  const notes = buildAnnotationLines(frame?.formula);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#fff;border-radius:8px;">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>
  <polygon points="${points.A.x},${points.A.y} ${points.B.x},${points.B.y} ${points.C.x},${points.C.y}" fill="#eff6ff" stroke="none"/>
  ${sideLines}
  ${vertexLabels}
  ${highlightTarget ? `<text x="${w / 2}" y="${annotationTop - 16}" text-anchor="middle" font-size="11" fill="#dc2626">赤い部分に注目</text>` : ""}
  ${notes ? `<g>
    <rect x="52" y="${annotationTop}" width="${w - 104}" height="70" rx="8" fill="#f8fafc" stroke="#dbeafe"/>
    ${notes}
  </g>` : ""}
</svg>`;
}

function buildTrianglePoints(
  model: MeaningModel,
  bounds: { left: number; right: number; top: number; bottom: number }
): Record<VertexId, Point> {
  const angleA = getAngle(model, "A");
  const angleB = getAngle(model, "B");
  const base = bounds.right - bounds.left;
  let raw: Record<VertexId, Point> | null = null;

  if (angleA && angleB && angleA > 0 && angleB > 0 && angleA + angleB < 180) {
    const alpha = degreesToRadians(angleA);
    const beta = degreesToRadians(angleB);
    const tanA = Math.tan(alpha);
    const tanB = Math.tan(beta);
    const cx = (base * tanB) / (tanA + tanB);
    const cy = cx * tanA;
    raw = {
      A: { x: 0, y: 0 },
      B: { x: base, y: 0 },
      C: { x: cx, y: -cy },
    };
  }

  if (!raw) {
    raw = {
      A: { x: 0, y: 0 },
      B: { x: base, y: 0 },
      C: { x: base * 0.36, y: -base * 0.62 },
    };
  }

  return fitPoints(raw, bounds);
}

function fitPoints(
  points: Record<VertexId, Point>,
  bounds: { left: number; right: number; top: number; bottom: number }
): Record<VertexId, Point> {
  const xs = Object.values(points).map((p) => p.x);
  const ys = Object.values(points).map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (bounds.right - bounds.left) / Math.max(maxX - minX, 1),
    (bounds.bottom - bounds.top) / Math.max(maxY - minY, 1)
  );
  const fittedWidth = (maxX - minX) * scale;
  const fittedHeight = (maxY - minY) * scale;
  const offsetX = bounds.left + (bounds.right - bounds.left - fittedWidth) / 2;
  const offsetY = bounds.top + (bounds.bottom - bounds.top - fittedHeight) / 2;

  return {
    A: { x: round(offsetX + (points.A.x - minX) * scale), y: round(offsetY + (points.A.y - minY) * scale) },
    B: { x: round(offsetX + (points.B.x - minX) * scale), y: round(offsetY + (points.B.y - minY) * scale) },
    C: { x: round(offsetX + (points.C.x - minX) * scale), y: round(offsetY + (points.C.y - minY) * scale) },
  };
}

function renderSide(
  side: TriangleSideModel,
  points: Record<VertexId, Point>,
  isVisible: (id: string) => boolean,
  strokeFor: (id: string) => string,
  widthFor: (id: string) => string
): string {
  const from = points[normalizeVertex(side.from)];
  const to = points[normalizeVertex(side.to)];
  const mid = midpoint(from, to);
  const normal = sideLabelNormal(from, to, centroid(points));
  const labelPoint = offset(mid, normal, 24);
  const label = side.value_label ?? side.label;

  return [
    `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeFor(side.id)}" stroke-width="${widthFor(side.id)}"/>`,
    isVisible(side.id)
      ? `<text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${strokeFor(side.id)}" font-weight="bold">${escapeSvgText(label)}</text>`
      : "",
  ].join("\n");
}

function buildAnnotationLines(formula: string | null | undefined): string {
  if (!formula) return "";
  const lines = wrapText(formula, 44).slice(0, 2);
  return lines.map((line, index) =>
    `<text x="320" y="${350 + index * 22}" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="#111827" font-weight="bold">${escapeSvgText(line)}</text>`
  ).join("\n");
}

function getAngle(model: MeaningModel, vertexId: VertexId): number | null {
  const vertex = model.triangle_vertices?.find((v) => normalizeVertex(v.id) === vertexId);
  if (!vertex?.angle_label) return null;
  const match = /(\d+(?:\.\d+)?)/.exec(vertex.angle_label);
  return match ? Number(match[1]) : null;
}

function normalizeVertex(value: string): VertexId {
  return value === "B" || value === "C" ? value : "A";
}

function centroid(points: Record<VertexId, Point>): Point {
  return {
    x: (points.A.x + points.B.x + points.C.x) / 3,
    y: (points.A.y + points.B.y + points.C.y) / 3,
  };
}

function midpoint(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

function offset(point: Point, direction: Point, distance: number): Point {
  return {
    x: round(point.x + direction.x * distance),
    y: round(point.y + direction.y * distance),
  };
}

function unitVectorFromCentroid(point: Point, center: Point): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function sideLabelNormal(from: Point, to: Point, center: Point): Point {
  const mid = midpoint(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const candidates = [
    { x: -dy, y: dx },
    { x: dy, y: -dx },
  ];
  const outward = candidates.sort((a, b) => {
    const scoreA = dot(a, { x: mid.x - center.x, y: mid.y - center.y });
    const scoreB = dot(b, { x: mid.x - center.x, y: mid.y - center.y });
    return scoreB - scoreA;
  })[0];
  const len = Math.hypot(outward.x, outward.y) || 1;
  return { x: outward.x / len, y: outward.y / len };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function wrapText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
