// src/app/api/export-docx/route.ts
import { NextResponse } from "next/server";
import HTMLtoDOCX from "html-to-docx";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

function safeDocxFilename(name: string) {
  const base = (name || "document.docx").trim() || "document.docx";
  const withExt = base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`;
  // strip path separators + illegal characters (Windows + general safety)
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

function toUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);

  // Buffer / TypedArray / DataView etc.
  if (
    input &&
    typeof input === "object" &&
    "buffer" in input &&
    (input as any).buffer instanceof ArrayBuffer
  ) {
    const view = input as { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
    const byteOffset = typeof view.byteOffset === "number" ? view.byteOffset : 0;
    const byteLength =
      typeof view.byteLength === "number" ? view.byteLength : view.buffer.byteLength;
    return new Uint8Array(view.buffer, byteOffset, byteLength);
  }

  // last resort (will throw if unsupported)
  return new Uint8Array(input as any);
}

function toExactArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

function startsWithPK(u8: Uint8Array) {
  return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b; // "PK"
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = safeDocxFilename(String(body?.filename ?? "document.docx"));

    if (!html) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // html-to-docx can accept full HTML; but it behaves best with a single doc root.
    // Your cover letter HTML is already a complete document, so just pass it through.
    const docxLike = await HTMLtoDOCX(html, undefined, {
      // keep it simple and serverless-safe
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });

    const u8 = toUint8Array(docxLike);

    // Sanity check: must be a valid ZIP header
    if (!startsWithPK(u8)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DOCX generator returned non-DOCX bytes (not a ZIP/PK file). " +
            "This usually means html-to-docx failed and returned an error payload instead of a document.",
        },
        { status: 500 }
      );
    }

    const ab = toExactArrayBuffer(u8);

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
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
