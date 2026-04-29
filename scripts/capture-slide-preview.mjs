#!/usr/bin/env node

import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const DEFAULT_VIEWPORT = { width: 1600, height: 900 };
const GOOGLE_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.html && !args.url) {
    throw new Error("usage: npm run preview:capture -- --html path/to/slides.html [--out ...] OR --url http://localhost:3000/api/jobs/<id>/preview");
  }
  const sourceLabel = args.url ?? resolve(args.html);
  if (args.html) {
    await stat(resolve(args.html));
  }

  const outDir = resolve(
    args.out ??
      join(
        ".artifacts",
        "preview-check",
        args.url ? sanitizeUrlLabel(args.url) : basename(resolve(args.html), extname(resolve(args.html)))
      )
  );
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: GOOGLE_CHROME_PATH,
  });

  try {
    const page = await browser.newPage({
      viewport: DEFAULT_VIEWPORT,
      deviceScaleFactor: 2,
    });

    const targetUrl = args.url ?? pathToFileURL(resolve(args.html)).href;
    await page.goto(targetUrl, { waitUntil: "load" });
    await page.addStyleTag({
      content: `
        * {
          animation-play-state: paused !important;
          transition: none !important;
          caret-color: transparent !important;
        }
      `,
    });

    const sceneCount = await page.locator("section.scene-slide").count();
    if (sceneCount === 0) {
      throw new Error("scene-slide が見つかりませんでした。先に HTMLプレビューを生成してください。");
    }

    const manifest = {
      source: sourceLabel,
      output_dir: outDir,
      captured_at: new Date().toISOString(),
      viewport: DEFAULT_VIEWPORT,
      scenes: [],
    };

    for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
      const locator = page.locator("section.scene-slide").nth(sceneIndex);
      await locator.scrollIntoViewIfNeeded();

      const sceneMeta = await locator.evaluate((section, index) => {
        const stepCount = Math.max(
          section.querySelectorAll(".scene-layer").length,
          section.querySelectorAll(".scene-step-note").length,
          section.querySelectorAll(".scene-formula").length
        );
        const title = section.querySelector("h2")?.textContent?.trim() ?? `Scene ${index + 1}`;
        return { stepCount, title };
      }, sceneIndex);

      const sceneRecord = {
        index: sceneIndex,
        title: sceneMeta.title,
        step_count: sceneMeta.stepCount,
        captures: [],
      };

      for (let stepIndex = 0; stepIndex < sceneMeta.stepCount; stepIndex += 1) {
        const state = await locator.evaluate((section, visibleStep) => {
          const layers = [...section.querySelectorAll(".scene-layer")];
          const notes = [...section.querySelectorAll(".scene-step-note")];
          const formulas = [...section.querySelectorAll(".scene-formula")];

          for (const [index, layer] of layers.entries()) {
            const isVisible = index <= visibleStep;
            layer.style.animation = "none";
            layer.style.opacity = isVisible ? "1" : "0";
            layer.style.transform = "none";
            layer.style.zIndex = String(index + 1);
          }

          for (const [index, note] of notes.entries()) {
            const isVisible = index <= visibleStep;
            note.style.animation = "none";
            note.style.opacity = isVisible ? "1" : "0";
            note.style.transform = "none";
          }

          for (const [index, formula] of formulas.entries()) {
            const isVisible = index <= visibleStep;
            formula.style.animation = "none";
            formula.style.opacity = isVisible ? "1" : "0";
            formula.style.transform = "none";
          }

          const visibleNotes = notes
            .slice(0, visibleStep + 1)
            .map((node) => node.textContent?.trim() ?? "")
            .filter(Boolean);

          const visibleFormulas = formulas
            .slice(0, visibleStep + 1)
            .map((node) => node.textContent?.trim() ?? "")
            .filter(Boolean);

          return {
            visibleNotes,
            visibleFormulas,
          };
        }, stepIndex);

        await page.waitForTimeout(40);

        const filename = `scene-${String(sceneIndex + 1).padStart(2, "0")}-step-${String(stepIndex + 1).padStart(2, "0")}.png`;
        const imagePath = join(outDir, filename);
        await locator.screenshot({ path: imagePath });

        sceneRecord.captures.push({
          step_index: stepIndex,
          filename,
          notes: state.visibleNotes,
          formulas: state.visibleFormulas,
          is_final: stepIndex === sceneMeta.stepCount - 1,
        });
      }

      manifest.scenes.push(sceneRecord);
    }

    await writeFile(
      join(outDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          scene_count: manifest.scenes.length,
          output_dir: outDir,
          manifest: join(outDir, "manifest.json"),
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

function sanitizeUrlLabel(value) {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "preview";
}

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }

  return args;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
