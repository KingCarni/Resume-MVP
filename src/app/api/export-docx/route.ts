// src/app/api/export-docx/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  html: string;
  filename?: string; // optional
};

function startsWithPK(u8: Uint8Array) {
  // ZIP magic header: 0x50 0x4B ("PK")
  return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = String(body?.filename ?? "resume").replace(/[^\w\-]+/g, "-");

    if (!html) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // Dynamic import: html-to-docx
    const mod: any = await import("html-to-docx");
    const htmlToDocx: any = mod?.default ?? mod;

    const docxBytes: Buffer | Uint8Array = await htmlToDocx(html);

    // Normalize to Uint8Array for NextResponse
    const u8 =
      docxBytes instanceof Uint8Array ? docxBytes : new Uint8Array(docxBytes);

    // Sanity check: if it doesn't look like a zip/docx, fail loudly
    if (!startsWithPK(u8)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DOCX generator returned non-DOCX bytes (not a ZIP/PK file). This often happens if html-to-docx fails in serverless.",
        },
        { status: 500 }
      );
    }

    return new NextResponse(u8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
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
