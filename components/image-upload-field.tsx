"use client";

import { useRef, useState } from "react";

interface ImageUploadFieldProps {
  name: string;
  label: string;
  accept?: string;
}

export function ImageUploadField({
  name,
  label,
  accept = "image/*",
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPreview(null);
      setFileName(null);
      return;
    }
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = "";
    setPreview(null);
    setFileName(null);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        onChange={handleChange}
        className="block w-full text-sm text-zinc-500 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300"
      />
      {preview && (
        <div className="relative mt-2">
          <img
            src={preview}
            alt={`${label}のプレビュー`}
            className="max-h-48 rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
          />
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-zinc-500">{fileName}</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-red-500 hover:text-red-700"
            >
              クリア
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
