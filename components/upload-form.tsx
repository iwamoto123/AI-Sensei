"use client";

import { useActionState } from "react";
import { ImageUploadField } from "@/components/image-upload-field";
import { uploadAction } from "@/app/new/actions";

export interface UploadState {
  error?: string;
}

const initialState: UploadState = {};

export function UploadForm() {
  const [state, formAction, isPending] = useActionState(
    uploadAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-6">
      <ImageUploadField name="problemImage" label="問題画像" />
      <ImageUploadField name="answerImage" label="解答画像" />

      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white sm:w-auto"
      >
        {isPending ? "アップロード中..." : "アップロード"}
      </button>
    </form>
  );
}
