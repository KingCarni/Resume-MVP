// src/app/api/export-docx/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  html: string;
};

function toPureArrayBuffer(input: Buffer | Uint8Array): ArrayBuffer {
  // ✅ Always return a REAL ArrayBuffer (not SharedArrayBuffer)
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);

  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8); // copy bytes
  return ab;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();

    if (!html) {
      return NextResponse.json(
        { ok: false, error: "Missing html" },
        { status: 400 }
      );
    }

    // ✅ Dynamic import to avoid TS type issues for html-to-docx
    const mod: any = await import("html-to-docx");
    const htmlToDocx: any = mod?.default ?? mod;

    // html-to-docx typically returns Buffer | Uint8Array depending on version/runtime
    const docxBytes: Buffer | Uint8Array = await htmlToDocx(html);

    const ab = toPureArrayBuffer(docxBytes);

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="cover-letter.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("export-docx error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "DOCX export failed" },
      { status: 500 }
    );
  }
}
