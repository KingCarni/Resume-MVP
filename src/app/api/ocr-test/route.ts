// src/app/api/ocr-test/route.ts
import { NextResponse } from "next/server";
import { ocrPdfWithGoogleVision } from "@/lib/pdf_ocr_google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store, max-age=0", ...(init?.headers || {}) },
  });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/pdf")) {
      return ok({ ok: false, error: "Send raw PDF bytes with Content-Type: application/pdf" }, { status: 400 });
    }

    const buf = Buffer.from(await req.arrayBuffer());
    if (!buf.length) return ok({ ok: false, error: "Empty body" }, { status: 400 });

    const result = await ocrPdfWithGoogleVision(buf);

    return ok({
      ok: true,
      bytes: buf.length,
      textPreview: result.text.slice(0, 800),
      textLength: result.text.length,
      pages: result.pages ?? null,
      gcsInputUri: result.gcsInputUri,
      gcsOutputPrefix: result.gcsOutputPrefix,
    });
  } catch (err: any) {
    return ok({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}