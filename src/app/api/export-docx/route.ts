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

function toPureArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  const ab = new ArrayBuffer(input.byteLength);
  new Uint8Array(ab).set(input);
  return ab;
}

type ChromiumLike = {
  args: string[];
  executablePath: (input?: string) => Promise<string>;
};

function isChromiumLike(x: any): x is ChromiumLike {
  return (
    x &&
    typeof x === "object" &&
    Array.isArray(x.args) &&
    typeof x.executablePath === "function"
  );
}

/**
 * ✅ Robustly resolve @sparticuz/chromium-min export shapes across ESM/CJS/bundlers.
 * We try several likely locations and pick the first that looks like chromium.
 */
async function loadChromiumMin(): Promise<ChromiumLike> {
  const mod: any = await import("@sparticuz/chromium-min");

  // Try common shapes:
  const candidates = [
    mod,
    mod?.default,
    mod?.default?.default,
    mod?.chromium,
    mod?.default?.chromium,
    mod?.default?.default?.chromium,
  ].filter(Boolean);

  for (const c of candidates) {
    if (isChromiumLike(c)) return c;
  }

  // Helpful debug (shows what we actually got in Vercel logs)
  const keys = (v: any) => (v && typeof v === "object" ? Object.keys(v) : []);
  console.error("chromium-min import shape debug:", {
    modKeys: keys(mod),
    defaultKeys: keys(mod?.default),
    defaultDefaultKeys: keys(mod?.default?.default),
    chromiumKeys: keys(mod?.chromium),
  });

  throw new Error(
    "Failed to load a valid chromium object from @sparticuz/chromium-min (executablePath/args missing). " +
      "Check that @sparticuz/chromium-min is installed and @sparticuz/chromium is uninstalled."
  );
}

/**
 * ✅ chromium-min requires CHROMIUM_REMOTE_EXEC_PATH on Vercel.
 * Cache across warm invocations to avoid re-downloading.
 */
let cachedExecutablePath: string | null = null;
let downloading: Promise<string> | null = null;

async function resolveExecutablePath(chromium: ChromiumLike): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  const remote = String(process.env.CHROMIUM_REMOTE_EXEC_PATH || "").trim();
  if (!remote) {
    throw new Error(
      "Missing CHROMIUM_REMOTE_EXEC_PATH. Set it in Vercel (Production + Preview) to a chromium-*-pack.tar.br URL."
    );
  }

  if (!downloading) {
    downloading = chromium.executablePath(remote).then((p: string) => {
      cachedExecutablePath = p;
      return p;
    });
  }

  const dl = downloading;
  if (!dl) throw new Error("Internal error: chromium download promise not initialized.");
  return dl;
}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const chromium = await loadChromiumMin();
  const executablePath = await resolveExecutablePath(chromium);

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
