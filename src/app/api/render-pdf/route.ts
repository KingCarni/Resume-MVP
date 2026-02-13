// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  html: string;
  filename?: string;
};

function toPureArrayBuffer(
  input: Uint8Array | Buffer | ArrayBuffer
): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;

  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = String(body?.filename ?? "document.pdf").trim();

    if (!html) {
      return NextResponse.json(
        { ok: false, error: "Missing html" },
        { status: 400 }
      );
    }

    /**
     * IMPORTANT:
     * Keep your existing PDF generation logic here.
     * Whatever you produce (Uint8Array/Buffer/ArrayBuffer) -> convert with toPureArrayBuffer().
     *
     * Replace the next line with YOUR existing generator call, e.g.
     * const pdfBytes = await renderPdf(html);
     */
    const pdfBytes = await renderPdfFromHtmlSomehow(html); // <-- replace this line

    const ab = toPureArrayBuffer(pdfBytes);

    const safeName = filename.toLowerCase().endsWith(".pdf")
      ? filename
      : `${filename}.pdf`;

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("render-pdf error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "PDF render failed" },
      { status: 500 }
    );
  }
}

/**
 * ⛔ Replace this stub with your real implementation.
 * I left it here only so the file is complete and compiles once you swap it.
 */
async function renderPdfFromHtmlSomehow(
  _html: string
): Promise<Uint8Array | Buffer | ArrayBuffer> {
  throw new Error(
    "renderPdfFromHtmlSomehow() is a stub. Paste your existing PDF generation code here."
  );
}
