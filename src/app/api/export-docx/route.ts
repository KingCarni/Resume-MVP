// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

function toPureArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;

  const ab = new ArrayBuffer(input.byteLength);
  new Uint8Array(ab).set(input);
  return ab;
}

function safePdfFilename(name: string) {
  const base = (name || "document.pdf").trim() || "document.pdf";
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

/**
 * ✅ Robust loader for @sparticuz/chromium-min across TS/ESM/CJS export shapes.
 * Some builds expose a default export; others expose named exports.
 */
async function loadChromium() {
  const mod: any = await import("@sparticuz/chromium-min");
  return mod?.default ?? mod;
}

/**
 * ✅ chromium-min requires CHROMIUM_REMOTE_EXEC_PATH on Vercel.
 * Cache across warm invocations to avoid repeated downloads.
 */
let cachedExecutablePath: string | null = null;
let downloading: Promise<string> | null = null;

async function resolveExecutablePath(): Promise<{ executablePath: string; chromium: any }> {
  const chromium = await loadChromium();

  if (cachedExecutablePath) return { executablePath: cachedExecutablePath, chromium };

  const remote = String(process.env.CHROMIUM_REMOTE_EXEC_PATH || "").trim();
  if (!remote) {
    throw new Error(
      "Missing CHROMIUM_REMOTE_EXEC_PATH. Set it in Vercel to a chromium-*-pack.tar.br URL."
    );
  }

    if (!downloading) {
    if (typeof chromium?.executablePath !== "function") {
      throw new Error(
        "Chromium module loaded, but executablePath() is missing. " +
          "This usually means an export-shape mismatch. (default vs namespace import)"
      );
    }

    downloading = chromium.executablePath(remote).then((p: string) => {
      cachedExecutablePath = p;
      return p;
    });
  }

  const dl = downloading; // ✅ TS now knows this is not null in this branch
  if (!dl) {
    throw new Error("Internal error: chromium download promise was not initialized.");
  }

  const executablePath = await dl;
  return { executablePath, chromium };

}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const { executablePath, chromium } = await resolveExecutablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
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
    return NextResponse.json(
      { ok: false, error: e?.message || "PDF render failed" },
      { status: 500 }
    );
  }
}
