// src/app/api/resume-pdf/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  html: string;
  filename?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;
    const html = String(body.html ?? "");
    const filename = String(body.filename ?? "resume").replace(/[^\w.-]+/g, "_");

    if (!html.trim()) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // Use Playwright to render HTML -> PDF
    let chromium: any;
    try {
      ({ chromium } = await import("playwright"));
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error:
            "PDF export requires Playwright. Install it with: npm i -D playwright && npx playwright install chromium",
        },
        { status: 501 }
      );
    }

    const browser = await chromium.launch({
      // You can flip this to true if you want to watch it render locally
      headless: true,
    });

    try {
      // ✅ Make rendering match the iframe preview:
      // - emulate screen media (not print)
      // - bump deviceScaleFactor for smoother gradients
      // - set a stable viewport so layout matches
      const page = await browser.newPage({
        viewport: { width: 1200, height: 1600 },
        deviceScaleFactor: 2,
      });

      // ✅ IMPORTANT: use "screen" styles instead of print styles
      await page.emulateMedia({ media: "screen" });

      // Load your HTML
      await page.setContent(html, { waitUntil: "load" });

      // Extra settling time for gradients / fonts in some environments
      await page.waitForTimeout(50);

      // Generate PDF (Letter is common for NA; swap to A4 if you want)
      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true, // respects @page if you defined it
        margin: { top: "0.4in", right: "0.4in", bottom: "0.4in", left: "0.4in" },
      });

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}.pdf"`,
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
