/**
 * 座標平面上に二次関数 y = x² のグラフを描画する SVG を生成する。
 * MVP では代表的な放物線を表示。将来的には explanation から係数を抽出して描画可能。
 */
export function generateFunctionGraphSvg(): string {
  const w = 480;
  const h = 360;
  const cx = w / 2;
  const cy = h / 2;
  const scale = 30;

  // y = x² のパスを生成（x: -4 to 4）
  const points: string[] = [];
  for (let px = -4; px <= 4; px += 0.1) {
    const py = px * px;
    const sx = cx + px * scale;
    const sy = cy - py * scale / 4; // スケール調整
    points.push(`${sx.toFixed(1)},${sy.toFixed(1)}`);
  }
  const pathData = `M ${points.join(" L ")}`;

  // グリッド線
  const gridLines: string[] = [];
  for (let i = -4; i <= 4; i++) {
    const x = cx + i * scale;
    const y = cy - i * scale;
    gridLines.push(
      `<line x1="${x}" y1="20" x2="${x}" y2="${h - 20}" stroke="#e5e7eb" stroke-width="0.5"/>`
    );
    gridLines.push(
      `<line x1="20" y1="${y}" x2="${w - 20}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`
    );
  }

  // 軸の目盛りラベル
  const labels: string[] = [];
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const x = cx + i * scale;
    labels.push(
      `<text x="${x}" y="${cy + 16}" text-anchor="middle" font-size="11" fill="#6b7280">${i}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#fff;border-radius:8px;">
  ${gridLines.join("\n  ")}
  <line x1="20" y1="${cy}" x2="${w - 20}" y2="${cy}" stroke="#374151" stroke-width="1.5" marker-end="url(#arrow)"/>
  <line x1="${cx}" y1="${h - 20}" x2="${cx}" y2="20" stroke="#374151" stroke-width="1.5" marker-end="url(#arrow)"/>
  <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#374151"/></marker></defs>
  <text x="${w - 28}" y="${cy - 8}" font-size="13" fill="#374151" font-weight="bold">x</text>
  <text x="${cx + 8}" y="32" font-size="13" fill="#374151" font-weight="bold">y</text>
  ${labels.join("\n  ")}
  <path d="${pathData}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>
  <text x="${cx + 100}" y="80" font-size="13" fill="#2563eb" font-weight="bold">y = x²</text>
</svg>`;
}
