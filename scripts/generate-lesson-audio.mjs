#!/usr/bin/env node
// Lesson IR の各 step ナレーションを step 単位で TTS 化し、実尺を計測して
// タイミング・サイドカー(lesson-ir.audio.json)を書き出す（音声ファースト同期用）。
//
// 使い方:
//   # macOS say（無料・即時）
//   node scripts/generate-lesson-audio.mjs [ir.json] [--voice Kyoko] [--rate 180]
//   # VOICEVOX（無料・ローカル・より自然 / 別途エンジン起動が必要）
//   node scripts/generate-lesson-audio.mjs [ir.json] --provider voicevox --speaker 3
//
// 読み上げテキスト:
//   step.narration_tts があればそれを優先。無ければ step.narration を
//   数式読み（x→エックス, − →引く 等）に自動正規化してから合成。
//
// 出力:
//   remotion/public/audio/<lessonId>/<stepId>.m4a   … Remotion が staticFile で参照
//   <ir と同じディレクトリ>/lesson-ir.audio.json     … step.id -> {file, duration_sec, text}

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--voice") args.voice = argv[++i];
    else if (a === "--rate") args.rate = argv[++i];
    else if (a === "--out-public") args.outPublic = argv[++i];
    else if (a === "--provider") args.provider = argv[++i];
    else if (a === "--speaker") args.speaker = argv[++i];
    else if (a === "--base-url") args.baseUrl = argv[++i];
    else if (a === "--no-normalize") args.noNormalize = true;
    else args.positional.push(a);
  }
  return args;
}

// 英字1文字 → カタカナ読み（数式変数用）
const LETTER_KANA = {
  a: "エイ", b: "ビー", c: "シー", d: "ディー", e: "イー", f: "エフ", g: "ジー",
  h: "エイチ", i: "アイ", j: "ジェー", k: "ケー", l: "エル", m: "エム", n: "エヌ",
  o: "オー", p: "ピー", q: "キュー", r: "アール", s: "エス", t: "ティー", u: "ユー",
  v: "ブイ", w: "ダブリュー", x: "エックス", y: "ワイ", z: "ゼット",
};

/** 日本語ナレーション中の数式断片を、自然な読みに正規化する。 */
function normalizeMath(input) {
  let s = input;
  // 上付き・下付き: x^2 → xの2乗、a_1 → aの1
  s = s.replace(/\^\s*2/g, "の2乗").replace(/\^\s*3/g, "の3乗").replace(/\^\s*\{?\s*(\d+)\s*\}?/g, "の$1乗");
  // 演算子（前後にスペースを入れて語として読ませる）
  s = s.replace(/[×*]/g, " かける ");
  s = s.replace(/[÷]/g, " わる ");
  s = s.replace(/[＝=]/g, " イコール ");
  // マイナス記号いろいろ（U+2212, ハイフン, 全角）。数や英字に挟まれる箇所を「引く」に
  s = s.replace(/\s*[−\-－]\s*/g, " 引く ");
  s = s.replace(/\s*[+＋]\s*/g, " 足す ");
  // 単独英字 → カナ（2x のように数字直後でもOK）
  s = s.replace(/[A-Za-z]/g, (ch) => LETTER_KANA[ch.toLowerCase()] ?? ch);
  // 余分な空白を整える
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([。、）)])/g, "$1").trim();
  return s;
}

function readingForStep(step, noNormalize) {
  if (step.narration_tts) return step.narration_tts.trim();
  const raw = (step.narration ?? "").trim();
  return noNormalize ? raw : normalizeMath(raw);
}

function execFileP(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, cmdArgs, options, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${stderr || err.message}`));
      else resolve({ stdout, stderr });
    });
  });
}

async function ffprobeDuration(file) {
  const { stdout } = await execFileP("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Math.round(parseFloat(stdout.trim()) * 1000) / 1000;
}

async function toM4a(srcPath, m4aPath) {
  await execFileP("ffmpeg", ["-y", "-i", srcPath, "-c:a", "aac", "-b:a", "96k", m4aPath], {
    timeout: 120_000,
  });
  fs.rmSync(srcPath, { force: true });
}

async function synthSay(text, voice, rate, tmpDir, stepId, m4aPath) {
  const aiff = path.join(tmpDir, `${stepId}.aiff`);
  const sayArgs = ["-v", voice];
  if (rate) sayArgs.push("-r", String(rate));
  sayArgs.push("-o", aiff, "--data-format=LEF32@22050", text);
  try {
    await execFileP("say", sayArgs, { timeout: 120_000 });
  } catch {
    await execFileP("say", ["-v", voice, "-o", aiff, text], { timeout: 120_000 });
  }
  await toM4a(aiff, m4aPath);
}

async function synthVoicevox(text, baseUrl, speaker, tmpDir, stepId, m4aPath) {
  const q = await fetch(`${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, {
    method: "POST",
  });
  if (!q.ok) throw new Error(`VOICEVOX audio_query failed: ${q.status} ${await q.text()}`);
  const query = await q.json();
  const s = await fetch(`${baseUrl}/synthesis?speaker=${speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`VOICEVOX synthesis failed: ${s.status} ${await s.text()}`);
  const wav = path.join(tmpDir, `${stepId}.wav`);
  fs.writeFileSync(wav, Buffer.from(await s.arrayBuffer()));
  await toM4a(wav, m4aPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const irPath = path.resolve(
    args.positional[0] ?? path.join(root, ".artifacts/reference-videos/factoring-01/lesson-ir.json")
  );
  const provider = args.provider ?? "macos-say";
  const voice = args.voice ?? "Kyoko";
  const rate = args.rate ?? null;
  const speaker = args.speaker ?? "3";
  const baseUrl = (args.baseUrl ?? process.env.VOICEVOX_BASE_URL ?? "http://127.0.0.1:50021").replace(/\/$/, "");

  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const lessonId = path.basename(path.dirname(irPath));

  const publicRoot = path.resolve(args.outPublic ?? path.join(root, "remotion/public"));
  const audioDir = path.join(publicRoot, "audio", lessonId);
  fs.mkdirSync(audioDir, { recursive: true });

  const clips = {};
  let totalSec = 0;
  let count = 0;

  for (const scene of ir.scenes ?? []) {
    for (const step of scene.steps ?? []) {
      if (!(step.narration ?? "").trim() && !step.narration_tts) continue;
      const text = readingForStep(step, args.noNormalize);
      if (!text) continue;
      const stepId = step.id;
      const m4a = path.join(audioDir, `${stepId}.m4a`);
      process.stdout.write(`  [${scene.id}/${stepId}] 合成中... `);
      if (provider === "voicevox") {
        await synthVoicevox(text, baseUrl, speaker, audioDir, stepId, m4a);
      } else {
        await synthSay(text, voice, rate, audioDir, stepId, m4a);
      }
      const duration = await ffprobeDuration(m4a);
      const rel = path.posix.join("audio", lessonId, `${stepId}.m4a`);
      clips[stepId] = { file: rel, duration_sec: duration, text };
      totalSec += duration;
      count += 1;
      console.log(`${duration.toFixed(2)}s  「${text}」`);
    }
  }

  const sidecarPath = path.join(path.dirname(irPath), "lesson-ir.audio.json");
  const sidecar = {
    generated_at: new Date().toISOString(),
    provider,
    voice: provider === "voicevox" ? null : voice,
    speaker: provider === "voicevox" ? speaker : null,
    base_url: provider === "voicevox" ? baseUrl : null,
    rate: rate ? Number(rate) : null,
    lesson_id: lessonId,
    public_dir: path.relative(root, publicRoot),
    total_audio_sec: Math.round(totalSec * 1000) / 1000,
    clip_count: count,
    clips,
  };
  fs.writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, "utf8");
  console.log(`\n✅ ${count} クリップ / 合計 ${totalSec.toFixed(1)}s`);
  console.log(`   サイドカー: ${sidecarPath}`);
  console.log(`   音声: ${audioDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
