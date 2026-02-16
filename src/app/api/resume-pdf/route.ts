// src/app/api/resume-pdf/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  html: string;
  filename?: string;
};

function safeFilename(name: string) {
  const base = String(name || "resume").trim() || "resume";
  return base.replace(/[^\w.-]+/g, "_");
}

type PuppeteerModule = {
  launch: (opts: {
    args?: string[];
    executablePath?: string;
    headless?: boolean;
    defaultViewport?: { width: number; height: number; deviceScaleFactor?: number };
  }) => Promise<{
    newPage: () => Promise<{
      emulateMediaType?: (t: "screen" | "print") => Promise<void>;
      setContent: (
        html: string,
        opts?: { waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2" }
      ) => Promise<void>;
      evaluate: <T>(fn: () => Promise<T> | T) => Promise<T>;
      pdf: (opts: {
        format?: "Letter";
        printBackground?: boolean;
        preferCSSPageSize?: boolean;
        margin?: { top: string; right: string; bottom: string; left: string };
      }) => Promise<Uint8Array>;
    }>;
    close: () => Promise<void>;
  }>;
};

type ChromiumModule = {
  args: string[];
  headless?: boolean;
  executablePath?: () => Promise<string> | string;
  setHeadlessMode?: boolean;
  setGraphicsMode?: boolean;
};

async function loadPdfDeps(): Promise<{ puppeteer: PuppeteerModule; chromium: ChromiumModule }> {
  const puppeteerImport = (await import("puppeteer-core")) as unknown as {
    default?: PuppeteerModule;
  } & PuppeteerModule;

  const chromiumImport = (await import("@sparticuz/chromium")) as unknown as {
    default?: ChromiumModule;
  } & ChromiumModule;

  const puppeteer = (puppeteerImport.default ?? puppeteerImport) as PuppeteerModule;
  const chromium = (chromiumImport.default ?? chromiumImport) as ChromiumModule;

  return { puppeteer, chromium };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const html = String(body.html ?? "");
    const filename = safeFilename(body.filename ?? "resume");

    if (!html.trim()) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    let puppeteer: PuppeteerModule;
    let chromium: ChromiumModule;

    try {
      ({ puppeteer, chromium } = await loadPdfDeps());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          ok: false,
          error: "Missing PDF deps. Install: npm i puppeteer-core @sparticuz/chromium",
          details: message,
        },
        { status: 501 }
      );
    }

    if (typeof chromium.setHeadlessMode !== "undefined") chromium.setHeadlessMode = true;
    if (typeof chromium.setGraphicsMode !== "undefined") chromium.setGraphicsMode = false;

    const executablePath =
      (typeof chromium.executablePath === "function" ? await chromium.executablePath() : chromium.executablePath) ||
      process.env.CHROME_EXECUTABLE_PATH ||
      undefined;

    if (!executablePath) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Chromium executablePath() was not resolved. Ensure @sparticuz/chromium is installed and supported in this environment.",
        },
        { status: 500 }
      );
    }

    // Letter @ 96dpi
    const LETTER_W = 816;
    const LETTER_H = 1056;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless ?? true,
      defaultViewport: { width: LETTER_W, height: LETTER_H, deviceScaleFactor: 1 },
    });

    try {
      const page = await browser.newPage();

      // Match iframe preview: "screen" media
      if (typeof page.emulateMediaType === "function") {
        await page.emulateMediaType("screen");
      }

      await page.setContent(html, { waitUntil: "networkidle0" });

      await page
        .evaluate(async () => {
          const fonts = (document as unknown as { fonts?: { ready?: Promise<void> } }).fonts;
          if (fonts?.ready) await fonts.ready;
        })
        .catch(() => {});

      await new Promise((r) => setTimeout(r, 50));

      const pdfBytes = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
      });

      // ✅ TS-proof: force a *real* ArrayBuffer (never SharedArrayBuffer)
      const copy = new Uint8Array(pdfBytes.byteLength);
      copy.set(pdfBytes);
      const arrayBuffer: ArrayBuffer = copy.buffer;

      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message || "PDF export failed" }, { status: 500 });
  }
}
