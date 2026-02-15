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

type ChromiumLike = {
  args: string[];
  executablePath: (input?: string) => Promise<string>;
};

function assertChromiumLike(x: any): asserts x is ChromiumLike {
  if (!x || typeof x !== "object") {
    throw new Error("Failed to load chromium-min: module is empty.");
  }
  if (!Array.isArray(x.args)) {
    throw new Error("Failed to load chromium-min: missing args[].");
  }
  if (typeof x.executablePath !== "function") {
    throw new Error("Failed to load chromium-min: executablePath() is not a function.");
  }
}

/**
 * ✅ Loads @sparticuz/chromium-min in a bundler-safe way:
 *   - ESM default export => mod.default
 *   - CJS export => mod
 */
async function loadChromium(): Promise<ChromiumLike> {
  const mod: any = await import("@sparticuz/chromium-min");
  const chromium: any = mod?.default ?? mod;
  assertChromiumLike(chromium);
  return chromium;
}

// Cache across warm invocations
let cachedExecutablePath: string | null = null;
let downloading: Promise<string> | null = null;

async function resolveExecutablePath(chromium: ChromiumLike): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  const remote = String(process.env.CHROMIUM_REMOTE_EXEC_PATH || "").trim();
  if (!remote) {
    throw new Error(
      "Missing CHROMIUM_REMOTE_EXEC_PATH. On Vercel, chromium-min needs a URL to a chromium-*-pack.tar(.br)."
    );
  }

  if (!downloading) {
    downloading = chromium.executablePath(remote).then((p) => {
      cachedExecutablePath = p;
      return p;
    });
  }

  const dl = downloading;
  if (!dl) throw new Error("Internal error: download promise not initialized.");
  return dl;
}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const chromium = await loadChromium();
  const executablePath = await resolveExecutablePath(chromium);

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle2" });
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
