import { UploadForm } from "@/components/upload-form";

export default function NewJobPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          新規作成
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          問題画像と解答画像をアップロードしてください。
        </p>
      </div>
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900 sm:p-8">
        <UploadForm />
      </section>
    </main>
  );
}
