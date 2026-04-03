import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Marp Markdown を Marp CLI で HTML に変換する。
 *
 * 処理フロー:
 * 1. 一時ディレクトリを作成
 * 2. Markdown を一時ファイルに書き出し
 * 3. Marp CLI を実行して HTML を生成
 * 4. 生成された HTML を読み取り
 * 5. 一時ファイルを削除
 * 6. HTML 文字列を返す
 */
export async function convertMarkdownToHtml(
  marpMarkdown: string
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "marp-"));
  const mdPath = join(dir, "slides.md");
  const htmlPath = join(dir, "slides.html");

  try {
    await writeFile(mdPath, marpMarkdown, "utf-8");

    await runMarpCli(mdPath, htmlPath);

    const html = await readFile(htmlPath, "utf-8");
    return html;
  } finally {
    await unlink(mdPath).catch(() => {});
    await unlink(htmlPath).catch(() => {});
  }
}

function runMarpCli(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "npx",
      ["marp", "--html", "--no-stdin", inputPath, "-o", outputPath],
      { timeout: 30_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(`Marp CLI failed: ${stderr || error.message}`)
          );
          return;
        }
        resolve();
      }
    );
  });
}
