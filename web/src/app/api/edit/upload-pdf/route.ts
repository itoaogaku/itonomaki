import { NextResponse } from "next/server";
import { requireEditAuth } from "@/lib/editAuth";
import { uploadPdf } from "@/lib/ftpImages";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await requireEditAuth())) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "PDFファイルのみアップロードできます" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "ファイルサイズが大きすぎます(20MBまで)" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadPdf(buffer, file.name);
    return NextResponse.json({ url, name: file.name });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
