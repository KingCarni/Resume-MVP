// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import puppeteer, { type Viewport } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

function safePdfFilename(name: string) {
  const base = (name || "document.pdf").trim() || "document.pdf";
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

function toPureArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

async function resolveExecutablePath(): Promise<string> {
  const brotliDir = path.join(
    process.cwd(),
    "node_modules",
    "@sparticuz",
    "chromium",
    "bin"
  );

  if (fs.existsSync(brotliDir)) {
    const p = await chromium.executablePath(brotliDir);
    if (p) return p;
  }

  const p = await chromium.executablePath();
  if (!p) {
    throw new Error(
      "Could not resolve chromium executablePath(). " +
        'Ensure next.config.ts has outputFileTracingIncludes: {"*": ["node_modules/@sparticuz/chromium/**"]} and redeploy.'
    );
  }
  return p;
}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const executablePath = await resolveExecutablePath();

  // Avoid TS warnings / keep puppeteer happy
  const headless: boolean = true;
  const defaultViewport: Viewport | null = null;

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless,
    defaultViewport,
  });

  try {
    const page = await browser.newPage();

    // ✅ Load the doc as the preview sees it
    await page.setContent(html, { waitUntil: "networkidle2" });

    // ✅ CRITICAL: render like the iframe preview (screen), NOT print
    await page.emulateMediaType("screen");

    // Helps preserve backgrounds/colors exactly
    await page.addStyleTag({
      content: `
        html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `,
    });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0.5in",
        right: "0.5in",
        bottom: "0.5in",
        left: "0.5in",
      },
    });

    return new Uint8Array(pdfBuffer);
  } finally {
    await browser.close();
  }
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
