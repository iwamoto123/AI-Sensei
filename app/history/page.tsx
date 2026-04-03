export default function HistoryPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          履歴一覧
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          タイトル・日付・分野・ステータス・再編集（Task 1-3 以降で DB
          連携予定）。
        </p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        まだ履歴はありません。
      </div>
    </main>
  );
}
