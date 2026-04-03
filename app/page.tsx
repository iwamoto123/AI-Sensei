import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          塾内利用向け MVP
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          参考書の問題と解答から、解説スライドと簡易動画をつくる
        </h1>
        <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
          問題画像と解答画像をアップロードすると、AIが内容を理解し、解法の理由やつまずきポイントまで補足した解説を生成します。Marp
          形式のスライドに変換し、HTML プレビューと簡易動画として確認できる想定です（音声は後続フェーズ）。
        </p>
      </div>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <li>入力: 問題画像・解答画像（1問ずつ）</li>
        <li>出力: 構造化された解説、Marp スライド、動画（第一段階は簡易品質）</li>
        <li>品質方針: 数式・論理の正確さを優先（速度は初回3分以内を目標）</li>
      </ul>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/new"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          新規作成へ
        </Link>
        <Link
          href="/history"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          履歴一覧へ
        </Link>
      </div>
    </main>
  );
}
