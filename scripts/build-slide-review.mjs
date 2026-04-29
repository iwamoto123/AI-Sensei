#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const DEFAULT_SLIDES_DIR = ".artifacts/slides/scene-final";
const DEFAULT_QUALITY_DIR = ".artifacts/slide-quality/scene-final";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const slidesDir = resolve(args.slidesDir ?? DEFAULT_SLIDES_DIR);
  const qualityDir = resolve(args.qualityDir ?? DEFAULT_QUALITY_DIR);
  const outPath = resolve(args.out ?? join(slidesDir, "review.html"));

  const cases = await collectCases(slidesDir, qualityDir, outPath);
  const html = buildHtml(cases);
  await writeFile(outPath, html, "utf8");

  console.log(JSON.stringify({ ok: true, out: outPath, case_count: cases.length }, null, 2));
}

async function collectCases(slidesDir, qualityDir, outPath) {
  const qualityRows = await readQualityRows(qualityDir);
  const qualityByCase = new Map(qualityRows.map((row) => [String(row.case_id), row]));
  const entries = await readdir(slidesDir, { withFileTypes: true });
  const cases = entries
    .filter((entry) => entry.isDirectory() && /^case-\d+$/.test(entry.name))
    .map((entry) => {
      const caseId = entry.name.replace(/^case-0*/, "") || "0";
      const caseDir = join(slidesDir, entry.name);
      const quality = qualityByCase.get(caseId);
      return {
        case_id: caseId,
        label: `Case ${caseId.padStart(2, "0")}`,
        slides_html: toRelative(outPath, join(caseDir, "slides.html")),
        slides_md: toRelative(outPath, join(caseDir, "slides.md")),
        preview_png: toRelative(outPath, join(caseDir, "preview.png")),
        judge: quality?.judge ?? null,
        issues: quality?.judge?.issues ?? [],
        fixes: quality?.judge?.suggested_fixes ?? [],
      };
    })
    .sort((a, b) => Number(a.case_id) - Number(b.case_id));

  return cases;
}

async function readQualityRows(qualityDir) {
  try {
    const content = await readFile(join(qualityDir, "results.jsonl"), "utf8");
    return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function buildHtml(cases) {
  const data = JSON.stringify(cases).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Slide Review</title>
  <style>
    :root { color-scheme: light; --border:#d1d5db; --muted:#6b7280; --ok:#15803d; --warn:#b45309; --bad:#b91c1c; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; color:#111827; background:#f3f4f6; }
    .app { display:grid; grid-template-columns: 320px minmax(0, 1fr); height:100vh; }
    aside { border-right:1px solid var(--border); background:#fff; overflow:auto; }
    header { padding:14px 16px; border-bottom:1px solid var(--border); position:sticky; top:0; background:#fff; z-index:2; }
    h1 { font-size:18px; margin:0 0 8px; }
    .summary { font-size:13px; color:var(--muted); }
    .case-list { padding:8px; display:grid; gap:6px; }
    button.case { width:100%; text-align:left; border:1px solid var(--border); background:#fff; padding:9px 10px; cursor:pointer; display:grid; gap:4px; }
    button.case.active { border-color:#2563eb; background:#eff6ff; }
    .case-title { display:flex; justify-content:space-between; gap:8px; font-weight:700; }
    .score { font-variant-numeric: tabular-nums; color:var(--muted); }
    .pass { color:var(--ok); }
    .fail { color:var(--bad); }
    main { display:grid; grid-template-rows:auto minmax(0, 1fr); min-width:0; }
    .toolbar { background:#fff; border-bottom:1px solid var(--border); padding:10px 14px; display:flex; align-items:center; gap:10px; }
    .toolbar button, .toolbar a { border:1px solid var(--border); background:#fff; color:#111827; text-decoration:none; padding:7px 10px; font-size:14px; cursor:pointer; }
    .toolbar .spacer { flex:1; }
    .viewer { display:grid; grid-template-columns:minmax(0, 1fr) 340px; min-height:0; }
    iframe { width:100%; height:100%; border:0; background:#fff; }
    .detail { border-left:1px solid var(--border); background:#fff; overflow:auto; padding:14px; }
    .detail h2 { margin:0 0 10px; font-size:20px; }
    .metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
    .metric { border:1px solid var(--border); padding:8px; }
    .metric-label { display:block; color:var(--muted); font-size:12px; }
    .metric-value { font-size:20px; font-weight:800; }
    h3 { font-size:15px; margin:16px 0 8px; }
    ul { margin:0; padding-left:20px; }
    li { margin:6px 0; line-height:1.35; }
    .thumb { width:100%; border:1px solid var(--border); display:block; margin-top:10px; }
    .hint { color:var(--muted); font-size:12px; margin-top:8px; }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <header>
        <h1>Slide Review</h1>
        <div class="summary"><span id="count"></span> / ← → キーで移動</div>
      </header>
      <div class="case-list" id="caseList"></div>
    </aside>
    <main>
      <div class="toolbar">
        <button id="prevBtn">前へ</button>
        <button id="nextBtn">次へ</button>
        <a id="openSlide" target="_blank" rel="noreferrer">スライドを別タブで開く</a>
        <a id="openMd" target="_blank" rel="noreferrer">Markdown</a>
        <div class="spacer"></div>
        <strong id="currentLabel"></strong>
      </div>
      <div class="viewer">
        <iframe id="frame" title="slide preview"></iframe>
        <section class="detail">
          <h2 id="detailTitle"></h2>
          <div class="metrics" id="metrics"></div>
          <h3>指摘</h3>
          <ul id="issues"></ul>
          <h3>改善案</h3>
          <ul id="fixes"></ul>
          <h3>プレビュー画像</h3>
          <a id="previewLink" target="_blank" rel="noreferrer"><img class="thumb" id="thumb" alt="preview" /></a>
          <div class="hint">レビューの観点: 答えの正確性、説明順、同一画面内の図＋追加テキスト、アニメーション進行。</div>
        </section>
      </div>
    </main>
  </div>
  <script>
    const cases = ${data};
    let current = 0;
    const caseList = document.getElementById("caseList");
    document.getElementById("count").textContent = cases.length + "件";

    function scoreClass(pass) { return pass ? "pass" : "fail"; }
    function metric(label, value) {
      return '<div class="metric"><span class="metric-label">' + label + '</span><span class="metric-value">' + (value ?? "n/a") + '</span></div>';
    }
    function list(items) {
      return (items && items.length ? items : ["なし"]).map((item) => '<li>' + escapeHtml(item) + '</li>').join("");
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));
    }
    function renderList() {
      caseList.innerHTML = cases.map((item, index) => {
        const pass = item.judge?.pass === true;
        const total = item.judge?.total_score ?? "n/a";
        return '<button class="case ' + (index === current ? "active" : "") + '" data-index="' + index + '">' +
          '<span class="case-title"><span>' + item.label + '</span><span class="score ' + scoreClass(pass) + '">' + total + '</span></span>' +
          '<span class="summary">答え ' + (item.judge?.answer_correctness ?? "n/a") + ' / 図 ' + (item.judge?.diagram_quality ?? "n/a") + ' / 進行 ' + (item.judge?.progression_quality ?? "n/a") + ' / 動き ' + (item.judge?.animation_quality ?? "n/a") + '</span>' +
          '</button>';
      }).join("");
      caseList.querySelectorAll("button.case").forEach((button) => {
        button.addEventListener("click", () => select(Number(button.dataset.index)));
      });
    }
    function select(index) {
      current = Math.max(0, Math.min(cases.length - 1, index));
      const item = cases[current];
      document.getElementById("frame").src = item.slides_html;
      document.getElementById("currentLabel").textContent = item.label;
      document.getElementById("detailTitle").textContent = item.label;
      document.getElementById("openSlide").href = item.slides_html;
      document.getElementById("openMd").href = item.slides_md;
      document.getElementById("previewLink").href = item.preview_png;
      document.getElementById("thumb").src = item.preview_png;
      document.getElementById("metrics").innerHTML =
        metric("答え", item.judge?.answer_correctness) +
        metric("図", item.judge?.diagram_quality) +
        metric("進行", item.judge?.progression_quality) +
        metric("動き", item.judge?.animation_quality) +
        metric("使いやすさ", item.judge?.slide_usability) +
        metric("総合", item.judge?.total_score) +
        metric("合格", item.judge?.pass ? "OK" : "NG");
      document.getElementById("issues").innerHTML = list(item.issues);
      document.getElementById("fixes").innerHTML = list(item.fixes);
      renderList();
      caseList.querySelector("button.active")?.scrollIntoView({ block: "nearest" });
    }
    document.getElementById("prevBtn").addEventListener("click", () => select(current - 1));
    document.getElementById("nextBtn").addEventListener("click", () => select(current + 1));
    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") select(current - 1);
      if (event.key === "ArrowRight") select(current + 1);
    });
    renderList();
    select(0);
  </script>
</body>
</html>`;
}

function toRelative(fromFile, targetFile) {
  return relative(resolve(fromFile, ".."), targetFile).replaceAll("\\", "/");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--slides-dir") args.slidesDir = argv[++index];
    else if (arg === "--quality-dir") args.qualityDir = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help") {
      console.log("usage: npm run slides:review -- [--slides-dir dir] [--quality-dir dir] [--out review.html]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
