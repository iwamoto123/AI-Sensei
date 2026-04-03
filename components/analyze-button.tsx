"use client";

import { useActionState } from "react";
import { runAnalysis, type AnalyzeState } from "@/app/jobs/[id]/actions";

interface Props {
  jobId: string;
  isRerun?: boolean;
}

const initialState: AnalyzeState = {};

export function AnalyzeButton({ jobId, isRerun = false }: Props) {
  const [state, formAction, isPending] = useActionState(
    runAnalysis,
    initialState
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {isPending
          ? "解析中..."
          : isRerun
            ? "再解析する"
            : "AI解析を実行する"}
      </button>
      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
