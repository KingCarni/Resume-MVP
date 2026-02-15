// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

function toPureArrayBuffer(input: Uint8Array | Buffer | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;

  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function safePdfFilename(name: string) {
  const base = (name || "document.pdf").trim() || "document.pdf";
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

async function resolveExecutablePath(): Promise<string> {
  /**
   * On Vercel/Next bundling, the chromium package’s bin/brotli assets can be omitted
   * unless outputFileTracingIncludes is configured. If they exist, prefer them.
   */
  const brotliDir = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");

  try {
    if (fs.existsSync(brotliDir)) {
      // Provide the brotli dir explicitly (avoids “bin missing” + remote fetch edge cases)
      const p = await chromium.executablePath(brotliDir);
      if (p) return p;
    }
  } catch {
    // fall through to default method
  }

  // Default behavior (may download pack on first run)
  const p = await chromium.executablePath();
  if (!p) {
    throw new Error(
      "Could not resolve Chromium executablePath(). " +
        "Make sure next.config.ts includes outputFileTracingIncludes for @sparticuz/chromium."
    );
  }
  return p;
}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const executablePath = await resolveExecutablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true, // ✅ boolean, avoids TS warning
  });

  try {
    const page = await browser.newPage();

    // Your HTML contains the template CSS already
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Ensure print CSS is applied
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
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

    // Extra hint for the exact failure you’re seeing
    const msg = String(e?.message || "PDF render failed");
    const hint =
      msg.includes("Unexpected status code: 404")
        ? "\n\nHint: This often happens when @sparticuz/chromium assets were not included in the Vercel function bundle. " +
          "Add outputFileTracingIncludes + serverExternalPackages in next.config.ts and redeploy."
        : "";

    return NextResponse.json({ ok: false, error: msg + hint }, { status: 500 });
  }
}
