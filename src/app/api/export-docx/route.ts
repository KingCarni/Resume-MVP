// src/app/api/export-docx/route.ts
export const runtime = "nodejs";
export const maxDuration = 60;

type ReqBody = {
  html: string;
  filename?: string;
};

function sanitizeFilename(name: string) {
  const safe = String(name || "resume")
    .trim()
    .replace(/[^\w\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "resume";
}

function startsWithPK(u8: Uint8Array) {
  // ZIP magic header: 0x50 0x4B ("PK")
  return u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b;
}

/**
 * Convert unknown "bytes-like" output into a *real* Uint8Array.
 * Important: always copy, so we don't accidentally return a view of a larger buffer.
 */
function toUint8ArrayCopy(input: unknown): Uint8Array {
  // Already Uint8Array
  if (input instanceof Uint8Array) {
    return new Uint8Array(input); // copy
  }

  // Node Buffer (in Node runtime it's a Uint8Array subclass, but be explicit)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeAny = input as any;
  if (maybeAny && typeof maybeAny === "object") {
    // ArrayBuffer
    if (maybeAny instanceof ArrayBuffer) {
      return new Uint8Array(maybeAny.slice(0)); // copy
    }

    // TypedArray / DataView with underlying buffer
    const buf: unknown = maybeAny.buffer;
    const byteOffset: unknown = maybeAny.byteOffset;
    const byteLength: unknown = maybeAny.byteLength;

    if (buf instanceof ArrayBuffer && typeof byteOffset === "number" && typeof byteLength === "number") {
      const view = new Uint8Array(buf, byteOffset, byteLength);
      return new Uint8Array(view); // copy
    }
  }

  throw new Error("DOCX generator returned unsupported bytes type.");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = sanitizeFilename(String(body?.filename ?? "resume"));

    if (!html) {
      return Response.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // Dynamic import (safer in serverless)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("html-to-docx");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const htmlToDocx: any = mod?.default ?? mod;

    const rawBytes: unknown = await htmlToDocx(html);

    // Normalize to a safe, copied Uint8Array
    const u8 = toUint8ArrayCopy(rawBytes);

    // Sanity check: must be a valid ZIP header
    if (!startsWithPK(u8)) {
      return Response.json(
        {
          ok: false,
          error: "DOCX generator returned non-DOCX bytes (not a ZIP/PK file).",
        },
        { status: 500 }
      );
    }

    return new Response(u8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "DOCX export failed";
    console.error("export-docx error:", e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
