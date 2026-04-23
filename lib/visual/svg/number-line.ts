/**
 * 数直線（-5 ～ 5）を描画する SVG を生成する。
 * MVP では汎用的な数直線を表示。将来的には範囲のハイライトを追加可能。
 */
export function generateNumberLineSvg(): string {
  const w = 480;
  const h = 100;
  const y = h / 2;
  const left = 40;
  const right = w - 40;
  const range = 10; // -5 to 5
  const step = (right - left) / range;

  const ticks: string[] = [];
  for (let i = -5; i <= 5; i++) {
    const x = left + (i + 5) * step;
    const isBold = i === 0;
    ticks.push(
      `<line x1="${x}" y1="${y - 8}" x2="${x}" y2="${y + 8}" stroke="${isBold ? "#111827" : "#9ca3af"}" stroke-width="${isBold ? 2 : 1}"/>`
    );
    ticks.push(
      `<text x="${x}" y="${y + 24}" text-anchor="middle" font-size="12" fill="#374151" ${isBold ? 'font-weight="bold"' : ""}>${i}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#fff;border-radius:8px;">
  <line x1="${left - 10}" y1="${y}" x2="${right + 10}" y2="${y}" stroke="#374151" stroke-width="1.5" marker-end="url(#arr)"/>
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#374151"/></marker></defs>
  ${ticks.join("\n  ")}
</svg>`;
}
