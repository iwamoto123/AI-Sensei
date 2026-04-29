import { NextResponse } from "next/server";
import { getSlideProjectByJobId } from "@/lib/db/slide-projects";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;

  const slideProject = await getSlideProjectByJobId(id);
  if (!slideProject || !slideProject.html_content?.trim()) {
    return NextResponse.json(
      { error: "HTMLプレビューが見つかりません。" },
      { status: 404 }
    );
  }

  return new NextResponse(slideProject.html_content, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
