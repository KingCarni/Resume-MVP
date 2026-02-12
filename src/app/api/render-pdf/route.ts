// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
// Helps avoid caching / weirdness in dev
export const dynamic = "force-dynamic";

type ReqBody = { html?: string; filename?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const html = String(body?.html ?? "").trim();
    const filename = String(body?.filename ?? "cover-letter.pdf");

    if (!html) {
      return NextResponse.json(
        { ok: false, error: "Missing html in request body." },
        { status: 400 }
      );
    }

    const browser = await puppeteer.launch({
      // Most reliable setting across environments
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    try {
      const page = await browser.newPage();

      // Match “Document Preview” (screen styles), not print stylesheet
      await page.emulateMediaType("screen");

      // Give it a sane viewport; PDF will still be letter-sized
      await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });

      // Load the HTML
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        // If your templates already manage spacing, keep margins small
        margin: { top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in" },
      });

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename.endsWith(".pdf") ? filename : `${filename}.pdf`}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    // IMPORTANT: this shows up in your terminal running `npm run dev`
    console.error("[render-pdf] error:", err);

    const msg =
      typeof err?.message === "string" ? err.message : "Unknown server error";
    const stack = typeof err?.stack === "string" ? err.stack : "";

    // Return useful debug info to the client (dev only vibe)
    return NextResponse.json(
      { ok: false, error: msg, stack },
      { status: 500 }
    );
  }
}
