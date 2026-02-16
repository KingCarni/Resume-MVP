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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const html = String(body.html ?? "");
    const filename = safeFilename(body.filename ?? "resume");

    if (!html.trim()) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // ✅ Vercel-safe PDF rendering:
    // puppeteer-core + @sparticuz/chromium (no Playwright install step)
    let puppeteer: any;
    let chromium: any;

    try {
      puppeteer = (await import("puppeteer-core")).default ?? (await import("puppeteer-core"));
      chromium = (await import("@sparticuz/chromium")).default ?? (await import("@sparticuz/chromium"));
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing PDF deps. Install: npm i puppeteer-core @sparticuz/chromium",
          details: e?.message,
        },
        { status: 501 }
      );
    }

    // Sparticuz docs recommend these toggles; types vary by version,
    // so we only set them if they exist to avoid TS warnings.
    if (typeof chromium.setHeadlessMode !== "undefined") chromium.setHeadlessMode = true;
    if (typeof chromium.setGraphicsMode !== "undefined") chromium.setGraphicsMode = false;

    const executablePath =
      (await chromium.executablePath?.()) ||
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

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 1600 },
      executablePath,
      headless: chromium.headless ?? true,
    });

    try {
      const page = await browser.newPage();

      // ✅ Match iframe preview: use "screen" media, not "print"
      if (typeof page.emulateMediaType === "function") {
        await page.emulateMediaType("screen");
      }

      // Load HTML and wait for layout/fonts/assets to settle
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Wait for web fonts if supported (safe no-op otherwise)
      await page
        .evaluate(async () => {
          const fonts = (document as any).fonts;
          if (fonts?.ready) await fonts.ready;
        })
        .catch(() => {});

      // Tiny settle for gradients/layout
      await new Promise((r) => setTimeout(r, 50));

      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0.4in", right: "0.4in", bottom: "0.4in", left: "0.4in" },
      });

      return new NextResponse(pdfBuffer, {
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "PDF export failed" },
      { status: 500 }
    );
  }
}
