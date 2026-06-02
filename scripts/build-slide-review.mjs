#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
  const cases = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^case-\d+$/.test(entry.name))
    .map(async (entry) => {
      const caseId = entry.name.replace(/^case-0*/, "") || "0";
      const caseDir = join(slidesDir, entry.name);
      const quality = qualityByCase.get(caseId);
      const captureManifest = await readJsonOrNull(join(caseDir, "captures", "capture-manifest.json"));
      const audioManifest = await readJsonOrNull(join(caseDir, "audio", "audio-manifest.json"));
      const audioPath = resolveAudioPath(caseDir, audioManifest);
      const narration = await readJsonOrNull(join(caseDir, "narration.json"));
      return {
        case_id: caseId,
        label: `Case ${caseId.padStart(2, "0")}`,
        slides_html: toRelative(outPath, join(caseDir, "slides.html")),
        slides_md: toRelative(outPath, join(caseDir, "slides.md")),
        narration_md: existsSync(join(caseDir, "narration.md")) ? toRelative(outPath, join(caseDir, "narration.md")) : null,
        narration_json: existsSync(join(caseDir, "narration.json")) ? toRelative(outPath, join(caseDir, "narration.json")) : null,
        audio: audioPath ? toRelative(outPath, audioPath) : null,
        audio_manifest: audioManifest ? {
          provider: audioManifest.provider,
          model: audioManifest.model ?? audioManifest.audio_settings?.model ?? null,
          voice: audioManifest.voice ?? audioManifest.audio_settings?.voice ?? null,
          voice_id: audioManifest.voice_id ?? audioManifest.audio_settings?.voice_id ?? null,
          format: audioManifest.format ?? audioManifest.audio_settings?.format ?? null,
          status: audioManifest.status,
          character_count: audioManifest.character_count,
          estimated_duration_sec: audioManifest.estimated_duration_sec,
          cost_estimates_usd: audioManifest.cost_estimates_usd ?? null,
        } : null,
        narration_timeline: buildNarrationTimeline(narration),
        preview_png: toRelative(outPath, join(caseDir, "preview.png")),
        animation_captures: Array.isArray(captureManifest?.frames)
          ? captureManifest.frames.map((frame) => ({
            ...frame,
            path: toRelative(outPath, join(caseDir, frame.path)),
          }))
          : [],
        animation_capture_count: captureManifest?.frame_count ?? 0,
        judge: quality?.judge ?? null,
        issues: quality?.judge?.issues ?? [],
        fixes: quality?.judge?.suggested_fixes ?? [],
      };
    }));

  return cases
    .sort((a, b) => Number(a.case_id) - Number(b.case_id));
}

function resolveAudioPath(caseDir, audioManifest) {
  const candidates = [
    audioManifest?.output_audio,
    join(caseDir, "audio", "narration.mp3"),
    join(caseDir, "audio", "narration.wav"),
    join(caseDir, "audio", "narration.m4a"),
    join(caseDir, "audio", "narration.aiff"),
  ].filter(Boolean).map((path) => resolve(path));
  return candidates.find((path) => existsSync(path)) ?? null;
}

function buildNarrationTimeline(narration) {
  if (!Array.isArray(narration?.scenes)) return [];
  let cursorMs = 0;
  return narration.scenes.map((scene, index) => {
    const durationMs = Math.max(1000, Number(scene.estimated_duration_sec ?? 0) * 1000 || sumSegmentMs(scene));
    const item = {
      scene_id: scene.id,
      scene_index: index,
      title: scene.title ?? `Scene ${index + 1}`,
      start_ms: cursorMs,
      duration_ms: durationMs,
      end_ms: cursorMs + durationMs,
    };
    cursorMs += durationMs;
    return item;
  });
}

function sumSegmentMs(scene) {
  const total = (scene.segments ?? []).reduce((sum, segment) => sum + (Number(segment.estimated_duration_sec) || 0), 0);
  return Math.max(1000, total * 1000);
}

async function readQualityRows(qualityDir) {
  try {
    const content = await readFile(join(qualityDir, "results.jsonl"), "utf8");
    return content.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
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
    main { display:grid; grid-template-rows:auto minmax(0, 1fr); min-width:0; overflow:hidden; }
    .toolbar { background:#fff; border-bottom:1px solid var(--border); padding:10px 14px; display:flex; align-items:center; gap:10px; }
    .toolbar button, .toolbar a { border:1px solid var(--border); background:#fff; color:#111827; text-decoration:none; padding:7px 10px; font-size:14px; cursor:pointer; }
    .toolbar .spacer { flex:1; }
    .viewer { display:grid; grid-template-rows:minmax(360px, 58vh) minmax(0, 1fr); min-height:0; overflow:auto; }
    iframe { width:100%; height:100%; border:0; background:#fff; display:block; }
    .detail { border-top:1px solid var(--border); background:#fff; overflow:visible; padding:14px; }
    .detail h2 { margin:0 0 10px; font-size:20px; }
    .metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
    .metric { border:1px solid var(--border); padding:8px; }
    .metric-label { display:block; color:var(--muted); font-size:12px; }
    .metric-value { font-size:20px; font-weight:800; }
    .review-box { border-top:1px solid var(--border); margin-top:16px; padding-top:14px; display:grid; gap:10px; }
    .field { display:grid; gap:5px; }
    .field label { font-size:12px; color:var(--muted); font-weight:700; }
    .field textarea, .field input, .field select { width:100%; border:1px solid var(--border); padding:7px 8px; font:inherit; font-size:13px; background:#fff; }
    .field textarea { min-height:76px; resize:vertical; line-height:1.4; }
    .score-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .checks { display:grid; gap:5px; font-size:13px; }
    .checks label { display:flex; gap:7px; align-items:flex-start; color:#111827; font-weight:500; }
    .review-actions { display:flex; gap:8px; align-items:center; }
    .review-actions button { border:1px solid var(--border); background:#fff; padding:7px 10px; cursor:pointer; font-size:13px; }
    .saved { color:var(--ok); font-size:12px; min-height:16px; }
    .reviewed-badge { color:var(--ok); font-size:12px; font-weight:800; }
    .sync-player { border:1px solid var(--border); background:#f9fafb; padding:10px; margin:0 0 14px; display:grid; gap:8px; }
    .sync-player audio { width:100%; }
    .sync-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .sync-actions button { border:1px solid var(--border); background:#fff; padding:7px 10px; cursor:pointer; font-size:13px; }
    .sync-actions label { display:flex; gap:6px; align-items:center; font-size:12px; color:#374151; }
    .volume-control { min-width:130px; accent-color:#2563eb; }
    .audio-config { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; }
    .audio-config label { display:grid; gap:4px; color:var(--muted); font-size:12px; font-weight:700; }
    .audio-config input, .audio-config select { border:1px solid var(--border); background:#fff; padding:6px 7px; font:inherit; font-size:12px; min-width:0; }
    .command-preview { border:1px solid var(--border); background:#fff; color:#111827; padding:7px 8px; font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; line-height:1.35; white-space:pre-wrap; word-break:break-word; }
    .sync-status { color:var(--muted); font-size:12px; min-height:16px; }
    h3 { font-size:15px; margin:16px 0 8px; }
    ul { margin:0; padding-left:20px; }
    li { margin:6px 0; line-height:1.35; }
    .thumb { width:100%; border:1px solid var(--border); display:block; margin-top:10px; }
    .capture-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
    .capture-frame { display:grid; gap:3px; color:#111827; text-decoration:none; font-size:11px; }
    .capture-frame img { width:100%; display:block; border:1px solid var(--border); background:#fff; }
    .capture-frame span { color:var(--muted); }
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
        <a id="openNarration" target="_blank" rel="noreferrer">音声台本</a>
        <a id="openAudio" target="_blank" rel="noreferrer">音声</a>
        <button id="exportReview">レビューJSONを書き出し</button>
        <label class="toolbar-import">読み込み <input id="importReview" type="file" accept="application/json" hidden /></label>
        <div class="spacer"></div>
        <strong id="currentLabel"></strong>
      </div>
      <div class="viewer">
        <iframe id="frame" title="slide preview"></iframe>
        <section class="detail">
          <h2 id="detailTitle"></h2>
          <div class="sync-player" id="syncPlayer">
            <div class="sync-actions">
              <button id="playSynced">再生</button>
              <button id="pauseSynced">一時停止</button>
              <button id="stopSynced">停止</button>
              <button id="restartSynced">最初から</button>
              <button id="muteSynced">音量オフ</button>
              <input id="volumeSynced" class="volume-control" type="range" min="0" max="1" step="0.05" value="1" aria-label="音量" />
              <label>音声ファイル差し替え <input id="audioFileOverride" type="file" accept="audio/*" /></label>
              <label><input id="syncEnabled" type="checkbox" checked /> 音声時刻にスライドを同期</label>
            </div>
            <audio id="audioPlayer" controls preload="metadata"></audio>
            <div class="audio-config">
              <label>Provider
                <select id="audioProvider">
                  <option value="macos-say">macos-say</option>
                  <option value="voicevox">voicevox</option>
                  <option value="openai">openai</option>
                  <option value="mistral">mistral</option>
                  <option value="elevenlabs">elevenlabs</option>
                  <option value="local-openai">local-openai</option>
                </select>
              </label>
              <label>Model<input id="audioModel" /></label>
              <label>Voice / Speaker<input id="audioVoice" /></label>
              <label>Format<input id="audioFormat" /></label>
            </div>
            <div class="sync-actions">
              <button id="applyAudioConfig">設定を反映</button>
              <button id="copyAudioCommand">生成コマンドをコピー</button>
            </div>
            <div class="command-preview" id="audioCommand"></div>
            <div class="sync-status" id="syncStatus"></div>
          </div>
          <div class="metrics" id="metrics"></div>
          <h3>指摘</h3>
          <ul id="issues"></ul>
          <h3>改善案</h3>
          <ul id="fixes"></ul>
          <div class="review-box">
            <h3>人間レビュー</h3>
            <div class="field">
              <label for="humanPass">人の判定</label>
              <select id="humanPass">
                <option value="">未レビュー</option>
                <option value="pass">合格</option>
                <option value="needs_fix">要修正</option>
                <option value="blocker">重大な問題あり</option>
              </select>
            </div>
            <div class="score-grid">
              <div class="field"><label for="scoreAnswer">答え</label><input id="scoreAnswer" type="number" min="0" max="100" step="5" /></div>
              <div class="field"><label for="scoreDiagram">図</label><input id="scoreDiagram" type="number" min="0" max="100" step="5" /></div>
              <div class="field"><label for="scoreProgression">進行</label><input id="scoreProgression" type="number" min="0" max="100" step="5" /></div>
              <div class="field"><label for="scoreAnimation">動き</label><input id="scoreAnimation" type="number" min="0" max="100" step="5" /></div>
              <div class="field"><label for="scoreAudio">音声</label><input id="scoreAudio" type="number" min="0" max="100" step="5" /></div>
              <div class="field"><label for="scoreUsability">使いやすさ</label><input id="scoreUsability" type="number" min="0" max="100" step="5" /></div>
            </div>
            <div class="field">
              <label>問題タイプ</label>
              <div class="checks" id="humanTags">
                <label><input type="checkbox" value="answer_wrong" /> 答え・式が違う</label>
                <label><input type="checkbox" value="diagram_wrong" /> 図が問題に対応していない</label>
                <label><input type="checkbox" value="calculation_skipped" /> 途中計算が飛んでいる</label>
                <label><input type="checkbox" value="animation_flow_wrong" /> アニメーションの順序が不自然</label>
                <label><input type="checkbox" value="audio_mismatch" /> 音声とスライドがずれている</label>
                <label><input type="checkbox" value="text_too_dense" /> 文字量が多い/読みにくい</label>
              </div>
            </div>
            <div class="field">
              <label for="humanIssue">具体的な指摘</label>
              <textarea id="humanIssue" placeholder="どこが違うか、どのステップでつまずくかを書く"></textarea>
            </div>
            <div class="field">
              <label for="humanFix">理想の修正方針</label>
              <textarea id="humanFix" placeholder="次回AIに反映したい改善方針を書く"></textarea>
            </div>
            <div class="review-actions">
              <button id="saveHumanReview">このケースを保存</button>
              <button id="clearHumanReview">クリア</button>
              <span class="saved" id="reviewSaved"></span>
            </div>
          </div>
          <h3>プレビュー画像</h3>
          <a id="previewLink" target="_blank" rel="noreferrer"><img class="thumb" id="thumb" alt="preview" /></a>
          <h3>アニメーション検証キャプチャ</h3>
          <div id="captureGrid" class="capture-grid"></div>
          <div class="hint">レビューの観点: 答えの正確性、説明順、同一画面内の図＋追加テキスト、アニメーション進行。</div>
        </section>
      </div>
    </main>
  </div>
  <script>
    const cases = ${data};
    const storageKey = "ai-sensei-human-slide-reviews:" + location.pathname;
    let current = 0;
    let humanReviews = loadHumanReviews();
    let syncTimer = null;
    const caseList = document.getElementById("caseList");
    const frame = document.getElementById("frame");
    const audioPlayer = document.getElementById("audioPlayer");
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
        const reviewed = humanReviews[item.case_id]?.status ? '<span class="reviewed-badge">人レビュー済</span>' : '';
        return '<button class="case ' + (index === current ? "active" : "") + '" data-index="' + index + '">' +
          '<span class="case-title"><span>' + item.label + '</span><span class="score ' + scoreClass(pass) + '">' + total + '</span></span>' +
          '<span class="summary">答え ' + (item.judge?.answer_correctness ?? "n/a") + ' / 図 ' + (item.judge?.diagram_quality ?? "n/a") + ' / 進行 ' + (item.judge?.progression_quality ?? "n/a") + ' / 動き ' + (item.judge?.animation_quality ?? "n/a") + '</span>' +
          reviewed +
          '</button>';
      }).join("");
      caseList.querySelectorAll("button.case").forEach((button) => {
        button.addEventListener("click", () => select(Number(button.dataset.index)));
      });
    }
    function select(index) {
      current = Math.max(0, Math.min(cases.length - 1, index));
      const item = cases[current];
      stopSyncTimer();
      audioPlayer.pause();
      audioPlayer.removeAttribute("src");
      frame.src = item.audio ? withQuery(item.slides_html, "autoplay", "0") : item.slides_html;
      document.getElementById("currentLabel").textContent = item.label;
      document.getElementById("detailTitle").textContent = item.label;
      document.getElementById("openSlide").href = item.slides_html;
      document.getElementById("openMd").href = item.slides_md;
      setOptionalLink("openNarration", item.narration_md);
      setOptionalLink("openAudio", item.audio);
      renderSyncPlayer(item);
      document.getElementById("previewLink").href = item.preview_png;
      document.getElementById("thumb").src = item.preview_png;
      document.getElementById("captureGrid").innerHTML = renderCaptureFrames(item);
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
      loadHumanReviewIntoForm(item.case_id);
      renderList();
      caseList.querySelector("button.active")?.scrollIntoView({ block: "nearest" });
    }
    function setOptionalLink(id, href) {
      const link = document.getElementById(id);
      if (href) {
        link.href = href;
        link.style.display = "";
      } else {
        link.removeAttribute("href");
        link.style.display = "none";
      }
    }
    function withQuery(href, key, value) {
      const joiner = href.includes("?") ? "&" : "?";
      return href + joiner + encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }
    function renderSyncPlayer(item) {
      const panel = document.getElementById("syncPlayer");
      const status = document.getElementById("syncStatus");
      if (!item.audio) {
        panel.style.display = "none";
        status.textContent = "";
        return;
      }
      panel.style.display = "";
      audioPlayer.src = item.audio;
      const providerValue = item.audio_manifest?.provider ?? "macos-say";
      const defaults = audioDefaults(providerValue);
      setValue("audioProvider", providerValue);
      setValue("audioModel", item.audio_manifest?.model ?? defaults.model);
      setValue("audioVoice", item.audio_manifest?.voice ?? item.audio_manifest?.voice_id ?? defaults.voice);
      setValue("audioFormat", item.audio_manifest?.format ?? defaults.format);
      renderAudioCommand();
      const provider = item.audio_manifest?.provider ? " / " + item.audio_manifest.provider : "";
      const model = item.audio_manifest?.model ? " / model: " + item.audio_manifest.model : "";
      const voice = item.audio_manifest?.voice || item.audio_manifest?.voice_id ? " / voice: " + (item.audio_manifest.voice || item.audio_manifest.voice_id) : "";
      const duration = item.audio_manifest?.estimated_duration_sec ? " / 推定 " + item.audio_manifest.estimated_duration_sec + "秒" : "";
      status.textContent = "音声あり" + provider + model + voice + duration + "。再生ボタンでスライドと同時に開始します。";
    }
    function audioDefaults(provider) {
      const defaults = {
        "macos-say": { model: "macos-say", voice: "Kyoko", format: "m4a" },
        voicevox: { model: "voicevox-engine", voice: "3", format: "wav" },
        openai: { model: "gpt-4o-mini-tts", voice: "alloy", format: "mp3" },
        mistral: { model: "voxtral-mini-tts-2603", voice: "casual_male", format: "mp3" },
        elevenlabs: { model: "eleven_flash_v2_5", voice: "21m00Tcm4TlvDq8ikWAM", format: "mp3_44100_128" },
        "local-openai": { model: "local-tts", voice: "default", format: "mp3" },
      };
      return defaults[provider] ?? defaults["macos-say"];
    }
    function selectedAudioConfig() {
      return {
        provider: document.getElementById("audioProvider").value,
        model: document.getElementById("audioModel").value.trim(),
        voice: document.getElementById("audioVoice").value.trim(),
        format: document.getElementById("audioFormat").value.trim(),
      };
    }
    function applyAudioConfigDefaults(provider) {
      const defaults = audioDefaults(provider);
      setValue("audioModel", defaults.model);
      setValue("audioVoice", defaults.voice);
      setValue("audioFormat", defaults.format);
      renderAudioCommand();
    }
    function audioCommandFor(item) {
      const config = selectedAudioConfig();
      const parts = [
        "npm run audio:narration --",
        "--slides-dir .artifacts/slides/immersive-v1",
        "--case " + shellToken(item.case_id),
        "--provider " + shellToken(config.provider),
      ];
      if (config.model) parts.push("--model " + shellToken(config.model));
      if (config.voice) {
        if (config.provider === "voicevox") parts.push("--speaker " + shellToken(config.voice));
        else if (config.provider === "elevenlabs") parts.push("--voice-id " + shellToken(config.voice));
        else parts.push("--voice " + shellToken(config.voice));
      }
      if (config.format) parts.push("--format " + shellToken(config.format));
      return parts.join(" ");
    }
    function shellToken(value) {
      const text = String(value);
      if (/^[A-Za-z0-9._:/=-]+$/.test(text)) return text;
      return "'" + text.replaceAll("'", "'\\\\''") + "'";
    }
    function renderAudioCommand() {
      const item = cases[current];
      document.getElementById("audioCommand").textContent = item ? audioCommandFor(item) : "";
    }
    function previewApi() {
      try { return frame.contentWindow?.AISenseiPreview; }
      catch { return null; }
    }
    function sceneForTime(item, timeMs) {
      const timeline = item.narration_timeline || [];
      if (timeline.length === 0) return null;
      return timeline.find((scene) => timeMs >= scene.start_ms && timeMs < scene.end_ms) || timeline[timeline.length - 1];
    }
    function syncSlideToAudio() {
      const item = cases[current];
      if (!item?.audio || !document.getElementById("syncEnabled").checked) return;
      const api = previewApi();
      const scene = sceneForTime(item, audioPlayer.currentTime * 1000);
      if (!api || !scene) return;
      const elapsed = Math.max(0, audioPlayer.currentTime * 1000 - scene.start_ms);
      api.setSceneTime(scene.scene_index, elapsed);
      document.getElementById("syncStatus").textContent =
        item.label + " / " + scene.title + " / " + Math.round(audioPlayer.currentTime) + "秒";
    }
    function startSyncTimer() {
      stopSyncTimer();
      syncTimer = window.setInterval(syncSlideToAudio, 250);
    }
    function stopSyncTimer() {
      if (syncTimer) window.clearInterval(syncTimer);
      syncTimer = null;
    }
    async function playSynced() {
      const item = cases[current];
      if (!item?.audio) return;
      previewApi()?.stop?.();
      if (!audioPlayer.src) audioPlayer.src = item.audio;
      await audioPlayer.play();
      startSyncTimer();
      syncSlideToAudio();
    }
    function pauseSynced() {
      audioPlayer.pause();
      stopSyncTimer();
      previewApi()?.stop?.();
    }
    function stopSynced() {
      pauseSynced();
      audioPlayer.currentTime = 0;
      previewApi()?.goTo?.(0);
      syncSlideToAudio();
      document.getElementById("syncStatus").textContent = "停止しました。";
    }
    function updateMuteButton() {
      document.getElementById("muteSynced").textContent = audioPlayer.muted || audioPlayer.volume === 0 ? "音量オン" : "音量オフ";
    }
    function toggleMute() {
      audioPlayer.muted = !(audioPlayer.muted || audioPlayer.volume === 0);
      updateMuteButton();
    }
    async function restartSynced() {
      const item = cases[current];
      if (!item?.audio) return;
      audioPlayer.currentTime = 0;
      previewApi()?.goTo?.(0);
      await playSynced();
    }
    function renderCaptureFrames(item) {
      const frames = item.animation_captures || [];
      if (frames.length === 0) return '<div class="summary">キャプチャなし</div>';
      return frames.map((frame) => {
        const label = 'scene ' + frame.scene_index + ' / ' + frame.elapsed_ms + 'ms';
        return '<a class="capture-frame" href="' + frame.path + '" target="_blank" rel="noreferrer">' +
          '<img src="' + frame.path + '" alt="' + label + '" loading="lazy" />' +
          '<span>' + label + '</span>' +
          '</a>';
      }).join("");
    }
    function loadHumanReviews() {
      try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); }
      catch { return {}; }
    }
    function persistHumanReviews() {
      localStorage.setItem(storageKey, JSON.stringify(humanReviews));
    }
    function numberValue(id) {
      const value = document.getElementById(id).value;
      if (value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    function setValue(id, value) {
      document.getElementById(id).value = value ?? "";
    }
    function checkedTags() {
      return [...document.querySelectorAll("#humanTags input:checked")].map((input) => input.value);
    }
    function setCheckedTags(tags) {
      const set = new Set(tags || []);
      document.querySelectorAll("#humanTags input").forEach((input) => {
        input.checked = set.has(input.value);
      });
    }
    function readHumanReviewFromForm(caseId) {
      return {
        case_id: caseId,
        reviewed_at: new Date().toISOString(),
        status: document.getElementById("humanPass").value,
        scores: {
          answer: numberValue("scoreAnswer"),
          diagram: numberValue("scoreDiagram"),
          progression: numberValue("scoreProgression"),
          animation: numberValue("scoreAnimation"),
          audio: numberValue("scoreAudio"),
          usability: numberValue("scoreUsability"),
        },
        tags: checkedTags(),
        issue: document.getElementById("humanIssue").value.trim(),
        ideal_fix: document.getElementById("humanFix").value.trim(),
        source: cases.find((item) => item.case_id === caseId),
      };
    }
    function loadHumanReviewIntoForm(caseId) {
      const review = humanReviews[caseId] || {};
      setValue("humanPass", review.status);
      setValue("scoreAnswer", review.scores?.answer);
      setValue("scoreDiagram", review.scores?.diagram);
      setValue("scoreProgression", review.scores?.progression);
      setValue("scoreAnimation", review.scores?.animation);
      setValue("scoreAudio", review.scores?.audio);
      setValue("scoreUsability", review.scores?.usability);
      setCheckedTags(review.tags);
      setValue("humanIssue", review.issue);
      setValue("humanFix", review.ideal_fix);
      document.getElementById("reviewSaved").textContent = review.status ? "保存済み" : "";
    }
    function saveCurrentHumanReview() {
      const item = cases[current];
      const review = readHumanReviewFromForm(item.case_id);
      if (!review.status && !review.issue && !review.ideal_fix && review.tags.length === 0) {
        delete humanReviews[item.case_id];
      } else {
        humanReviews[item.case_id] = review;
      }
      persistHumanReviews();
      document.getElementById("reviewSaved").textContent = "保存しました";
      renderList();
    }
    function clearCurrentHumanReview() {
      const item = cases[current];
      delete humanReviews[item.case_id];
      persistHumanReviews();
      loadHumanReviewIntoForm(item.case_id);
      renderList();
    }
    function exportHumanReviews() {
      const reviews = Object.values(humanReviews).filter((review) => review.status || review.issue || review.ideal_fix || review.tags?.length);
      const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        review_page: location.pathname,
        case_count: cases.length,
        reviewed_count: reviews.length,
        learning_signal: {
          purpose: "AI-Sensei slide generation improvement",
          preferred_use: "Feed issue, ideal_fix, tags, and human scores back into prompt/rule updates and regression tests.",
        },
        reviews,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2) + "\\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "human-slide-reviews.json";
      a.click();
      URL.revokeObjectURL(url);
    }
    async function importHumanReviews(file) {
      const payload = JSON.parse(await file.text());
      const imported = Array.isArray(payload.reviews) ? payload.reviews : [];
      for (const review of imported) {
        if (review.case_id) humanReviews[String(review.case_id)] = review;
      }
      persistHumanReviews();
      loadHumanReviewIntoForm(cases[current].case_id);
      renderList();
    }
    document.getElementById("prevBtn").addEventListener("click", () => select(current - 1));
    document.getElementById("nextBtn").addEventListener("click", () => select(current + 1));
    document.getElementById("playSynced").addEventListener("click", () => playSynced().catch((error) => {
      document.getElementById("syncStatus").textContent = "音声を再生できません: " + error.message;
    }));
    document.getElementById("pauseSynced").addEventListener("click", pauseSynced);
    document.getElementById("stopSynced").addEventListener("click", stopSynced);
    document.getElementById("restartSynced").addEventListener("click", () => restartSynced().catch((error) => {
      document.getElementById("syncStatus").textContent = "音声を再生できません: " + error.message;
    }));
    document.getElementById("muteSynced").addEventListener("click", toggleMute);
    document.getElementById("volumeSynced").addEventListener("input", (event) => {
      audioPlayer.volume = Number(event.target.value);
      audioPlayer.muted = audioPlayer.volume === 0;
      updateMuteButton();
    });
    document.getElementById("audioProvider").addEventListener("change", (event) => applyAudioConfigDefaults(event.target.value));
    for (const id of ["audioModel", "audioVoice", "audioFormat"]) {
      document.getElementById(id).addEventListener("input", renderAudioCommand);
    }
    document.getElementById("applyAudioConfig").addEventListener("click", () => {
      renderAudioCommand();
      document.getElementById("syncStatus").textContent = "音声設定を反映しました。下の生成コマンドで音声を作り直せます。";
    });
    document.getElementById("copyAudioCommand").addEventListener("click", async () => {
      renderAudioCommand();
      const command = document.getElementById("audioCommand").textContent;
      try {
        await navigator.clipboard.writeText(command);
        document.getElementById("syncStatus").textContent = "生成コマンドをコピーしました。";
      } catch {
        document.getElementById("syncStatus").textContent = "生成コマンドを選択してコピーしてください。";
      }
    });
    document.getElementById("audioFileOverride").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      audioPlayer.pause();
      audioPlayer.src = URL.createObjectURL(file);
      document.getElementById("syncStatus").textContent = "選択した音声ファイルでプレビューします。";
    });
    audioPlayer.addEventListener("volumechange", updateMuteButton);
    audioPlayer.addEventListener("play", startSyncTimer);
    audioPlayer.addEventListener("pause", stopSyncTimer);
    audioPlayer.addEventListener("ended", stopSyncTimer);
    audioPlayer.addEventListener("seeked", syncSlideToAudio);
    audioPlayer.addEventListener("timeupdate", syncSlideToAudio);
    document.getElementById("saveHumanReview").addEventListener("click", saveCurrentHumanReview);
    document.getElementById("clearHumanReview").addEventListener("click", clearCurrentHumanReview);
    document.getElementById("exportReview").addEventListener("click", exportHumanReviews);
    document.getElementById("importReview").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (file) importHumanReviews(file).catch((error) => alert(error.message));
      event.target.value = "";
    });
    document.querySelector(".toolbar-import").addEventListener("click", () => document.getElementById("importReview").click());
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveCurrentHumanReview();
        return;
      }
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
