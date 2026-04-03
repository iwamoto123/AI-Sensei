import type { SlideProject } from "@/lib/types";

interface Props {
  slideProject: SlideProject;
}

export function MarpMarkdownView({ slideProject }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">スライド原稿</h2>
        <span className="text-xs text-zinc-400">
          テーマ: {slideProject.theme_name}
        </span>
      </div>
      <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-800">
        <code>{slideProject.marp_markdown}</code>
      </pre>
    </div>
  );
}
