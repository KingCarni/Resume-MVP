// src/app/api/export-docx/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  html: string;
  filename?: string;
};

function startsWithPK(u8: Uint8Array) {
  // ZIP magic header: 0x50 0x4B ("PK")
  return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b;
}

/**
 * Convert unknown “bytes-like” output to a Uint8Array safely.
 * Covers Buffer, Uint8Array, ArrayBuffer, and typed array views.
 */
function toUint8Array(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;

  if (input instanceof ArrayBuffer) return new Uint8Array(input);

  // Typed array / Buffer / DataView etc (anything with .buffer + byte info)
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

  // Last resort: try to construct (will throw if unsupported)
  return new Uint8Array(input as any);
}

/**
 * Ensure we return a REAL ArrayBuffer containing exactly the bytes (not the whole underlying buffer).
 * This avoids TS warnings and prevents accidental extra bytes in the response.
 */
function toExactArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}


export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = String(body?.filename ?? "resume").replace(/[^\w\-]+/g, "-");

    if (!html) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // Dynamic import (serverless-safe)
    const mod = (await import("html-to-docx")) as unknown;
    const htmlToDocx =
      typeof (mod as { default?: unknown }).default === "function"
        ? ((mod as { default: (html: string) => Promise<unknown> }).default)
        : (mod as unknown as (html: string) => Promise<unknown>);

    if (typeof htmlToDocx !== "function") {
      return NextResponse.json(
        { ok: false, error: "html-to-docx import failed: no function export found." },
        { status: 500 }
      );
    }

    const rawBytes = await htmlToDocx(html);
    const u8 = toUint8Array(rawBytes);

    // Sanity check: must be a valid ZIP header
    if (!startsWithPK(u8)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DOCX generator returned non-DOCX bytes (not a ZIP/PK file). This can happen if html-to-docx fails in serverless.",
        },
        { status: 500 }
      );
    }

    const ab = toExactArrayBuffer(u8);

    // ✅ Use Response for binary; NextResponse.json is for JSON
    return new Response(ab, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "DOCX export failed";
    console.error("export-docx error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
