export default function NewJobPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          新規作成
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          問題画像と解答画像をアップロードし、生成を開始します（Task 1-1
          でフォーム実装予定）。
        </p>
      </div>
      <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          問題画像アップロード欄・解答画像アップロード欄・単元選択（任意）・生成開始ボタンをここに配置します。
        </p>
      </section>
    </main>
  );
}
