"use client";

import { useActionState } from "react";
import { generateVisuals, type ActionState } from "@/app/jobs/[id]/actions";

interface Props {
  jobId: string;
  isRerun?: boolean;
}

const initialState: ActionState = {};

export function GenerateVisualsButton({ jobId, isRerun = false }: Props) {
  const [state, formAction, isPending] = useActionState(
    generateVisuals,
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
          ? "図を生成中..."
          : isRerun
            ? "図を再生成する"
            : "図を生成する"}
      </button>
      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
