/**
 * 直角三角形（30-60-90 型）を描画する SVG を生成する。
 * 三角比の解説に適した、辺と角度ラベル付きの図。
 */
export function generateTriangleSvg(): string {
  const w = 400;
  const h = 320;

  // 三角形の頂点座標
  const ax = 80;  // 左下（直角）
  const ay = 260;
  const bx = 340; // 右下
  const by = 260;
  const cx = 80;  // 左上
  const cy = 60;

  // 直角マーク
  const sq = 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background:#fff;border-radius:8px;">
  <!-- 三角形 -->
  <polygon points="${ax},${ay} ${bx},${by} ${cx},${cy}" fill="#eff6ff" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"/>
  <!-- 直角マーク -->
  <polyline points="${ax + sq},${ay} ${ax + sq},${ay - sq} ${ax},${ay - sq}" fill="none" stroke="#2563eb" stroke-width="1.5"/>
  <!-- 辺のラベル -->
  <text x="${(ax + bx) / 2}" y="${ay + 24}" text-anchor="middle" font-size="14" fill="#374151" font-weight="bold">底辺</text>
  <text x="${ax - 24}" y="${(ay + cy) / 2}" text-anchor="middle" font-size="14" fill="#374151" font-weight="bold" transform="rotate(-90,${ax - 24},${(ay + cy) / 2})">高さ</text>
  <text x="${(bx + cx) / 2 + 16}" y="${(by + cy) / 2}" text-anchor="start" font-size="14" fill="#374151" font-weight="bold">斜辺</text>
  <!-- 角度ラベル -->
  <path d="M ${bx - 40},${by} A 40,40 0 0,0 ${bx - 28},${by - 28}" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="${bx - 56}" y="${by - 16}" font-size="13" fill="#dc2626" font-weight="bold">θ</text>
  <!-- 頂点ラベル -->
  <text x="${ax - 8}" y="${ay + 24}" text-anchor="end" font-size="12" fill="#6b7280">A</text>
  <text x="${bx + 8}" y="${by + 24}" text-anchor="start" font-size="12" fill="#6b7280">B</text>
  <text x="${cx - 8}" y="${cy - 8}" text-anchor="end" font-size="12" fill="#6b7280">C</text>
</svg>`;
}
