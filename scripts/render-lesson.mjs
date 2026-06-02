#!/usr/bin/env node
// Lesson IR (JSON) → mp4 を Remotion でレンダリングするスタンドアロンスクリプト。
// 使い方: node scripts/render-lesson.mjs [path/to/lesson-ir.json] [out.mp4]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const irPath = path.resolve(
  process.argv[2] ?? path.join(root, ".artifacts/reference-videos/factoring-01/lesson-ir.json")
);
const outPath = path.resolve(process.argv[3] ?? path.join(root, ".artifacts/videos/factoring-01.mp4"));

function attachAudio(ir, irPath) {
  const sidecarPath = path.join(path.dirname(irPath), "lesson-ir.audio.json");
  if (!fs.existsSync(sidecarPath)) return { ir, hasAudio: false };
  const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
  const clips = sidecar.clips ?? {};
  let n = 0;
  for (const scene of ir.scenes ?? []) {
    for (const step of scene.steps ?? []) {
      const clip = clips[step.id];
      if (clip) {
        step.audio = { file: clip.file, duration_sec: clip.duration_sec };
        n += 1;
      }
    }
  }
  console.log(`    音声サイドカーを適用: ${n} クリップ (${sidecarPath})`);
  return { ir, hasAudio: n > 0 };
}

async function main() {
  const rawIr = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const { ir } = attachAudio(rawIr, irPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  console.log("[1/4] Chromium を準備...");
  await ensureBrowser();

  console.log("[2/4] Remotion バンドル作成...");
  const serveUrl = await bundle({
    entryPoint: path.join(root, "remotion/src/index.ts"),
    publicDir: path.join(root, "remotion/public"),
    webpackOverride: (c) => c,
  });

  console.log("[3/4] コンポジション選択...");
  const inputProps = { ir };
  const composition = await selectComposition({ serveUrl, id: "Lesson", inputProps });
  console.log(
    `    duration=${composition.durationInFrames}f @${composition.fps}fps (${(
      composition.durationInFrames / composition.fps
    ).toFixed(1)}s), ${composition.width}x${composition.height}`
  );

  console.log("[4/4] レンダリング...");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    onProgress: ({ progress }) => {
      process.stdout.write(`\r    ${(progress * 100).toFixed(1)}%   `);
    },
  });
  process.stdout.write("\n");
  console.log(`✅ 出力: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
