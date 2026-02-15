// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

function toPureArrayBuffer(input: Uint8Array | Buffer | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;

  // Buffer is a Uint8Array subclass in Node, so this covers both
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function safePdfFilename(name: string) {
  const base = (name || "document.pdf").trim() || "document.pdf";
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;

  // strip path separators + illegal characters (Windows + general safety)
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = safePdfFilename(String(body?.filename ?? "document.pdf"));

    if (!html) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    const pdfBytes = await renderPdfFromHtml(html);
    const ab = toPureArrayBuffer(pdfBytes);

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
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
 * ✅ Real PDF implementation (Vercel-safe)
 *
 * Requires:
 *   npm i puppeteer-core @sparticuz/chromium
 */
async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  // @sparticuz/chromium picks the right binary for serverless environments.
  // In local dev it also works (downloads/uses chromium path it provides).
 const executablePath = await chromium.executablePath();

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: executablePath || undefined,
  headless: true, // <- force boolean (removes TS warning)
});

  try {
    const page = await browser.newPage();

    // Your HTML already contains the CSS needed for parity with the preview
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Use print CSS (your templates include @media print rules)
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "Letter", // change to "A4" if you prefer
      printBackground: true,
      margin: {
        top: "0.5in",
        right: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
      },
    });

    // Buffer -> Uint8Array is acceptable return type
    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
}
