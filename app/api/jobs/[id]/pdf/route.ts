import { NextResponse } from "next/server";
import { getSlideProjectByJobId } from "@/lib/db/slide-projects";
import { convertMarkdownToPdf } from "@/lib/marp/convert";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const slideProject = await getSlideProjectByJobId(id);
  if (!slideProject || !slideProject.marp_markdown.trim()) {
    return NextResponse.json(
      { error: "スライド原稿が見つかりません。" },
      { status: 404 }
    );
  }

  try {
    const pdfBuffer = await convertMarkdownToPdf(slideProject.marp_markdown);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="slides-${id.slice(0, 8)}.pdf"`,
      },
    });
  } catch (e) {
    console.error("[PDF generation failed]", e);
    const message = e instanceof Error ? e.message : "PDF生成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
