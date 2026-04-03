"use client";

interface Props {
  htmlContent: string;
}

/**
 * Marp 生成 HTML を iframe で表示する。
 * srcDoc を使うことで、親ページの CSS と完全に分離し、
 * Marp の自己完結型 HTML をそのまま表示できる。
 */
export function SlidePreview({ htmlContent }: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">スライドプレビュー</h2>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        <iframe
          srcDoc={htmlContent}
          title="スライドプレビュー"
          className="h-[480px] w-full"
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
