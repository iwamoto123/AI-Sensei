import katex from "katex";
import type { Role, RoleSpan } from "./types";

/**
 * 指定トークンを role 色で \textcolor 包む。
 * 元文字列の位置で範囲を確定してから一括組み立てるので、
 * 挿入したhex内の文字を二重置換する事故を防ぐ。
 */
export function colorizeTex(
  tex: string,
  spans: RoleSpan[] | undefined,
  palette: Record<Role, string>
): string {
  if (!spans || spans.length === 0) return tex;
  const used = new Array(tex.length).fill(false);
  const ranges: { start: number; end: number; color: string }[] = [];

  for (const span of spans) {
    const color = palette[span.role] ?? palette.neutral;
    for (const tok of span.tokens) {
      if (!tok) continue;
      let from = 0;
      while (from <= tex.length - tok.length) {
        const idx = tex.indexOf(tok, from);
        if (idx < 0) break;
        let free = true;
        for (let i = idx; i < idx + tok.length; i++) {
          if (used[i]) {
            free = false;
            break;
          }
        }
        if (free) {
          for (let i = idx; i < idx + tok.length; i++) used[i] = true;
          ranges.push({ start: idx, end: idx + tok.length, color });
          break;
        }
        from = idx + 1;
      }
    }
  }

  if (ranges.length === 0) return tex;
  ranges.sort((a, b) => a.start - b.start);

  let out = "";
  let cur = 0;
  for (const r of ranges) {
    if (r.start < cur) continue;
    out += tex.slice(cur, r.start);
    out += `\\textcolor{${r.color}}{${tex.slice(r.start, r.end)}}`;
    cur = r.end;
  }
  out += tex.slice(cur);
  return out;
}

export function renderTex(
  tex: string,
  spans: RoleSpan[] | undefined,
  palette: Record<Role, string>,
  displayMode = true
): string {
  const colorized = colorizeTex(tex, spans, palette);
  return katex.renderToString(colorized, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: true,
    output: "html",
  });
}
