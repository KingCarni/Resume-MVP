// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import puppeteer, { type Viewport } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import fs from "fs";
import path from "path";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;

  /**
   * Optional idempotency key for this download attempt.
   * Client should generate a fresh ref per click (prevents double-charge on retry/network issues).
   */
  ref?: string;
};

const COST_PDF = 5;

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
  const brotliDir = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");

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

    // Load as preview sees it
    await page.setContent(html, { waitUntil: "networkidle2" });

    // CRITICAL: render like iframe preview (screen), NOT print
    await page.emulateMediaType("screen");

    // Preserve backgrounds/colors
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

function okJson(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

export async function POST(req: Request) {
  let chargedUserId = "";
  let charged = false;

  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const emailFromSession = session?.user?.email;
    if (!emailFromSession) return okJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email: emailFromSession } });
    if (!dbUser) return okJson({ ok: false, error: "User not found" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<ReqBody>;
    const html = String(body?.html ?? "").trim();
    const filename = safePdfFilename(String(body?.filename ?? "document.pdf"));
    const ref = String(body?.ref ?? "").trim();

    if (!html) return okJson({ ok: false, error: "Missing html" }, { status: 400 });

    // ✅ Charge credits
    const charge = await chargeCredits({
      userId: dbUser.id,
      cost: COST_PDF,
      reason: "render_pdf",
      eventType: "cover_letter", // reuse EventType you already have
      meta: { cost: COST_PDF, filename, htmlLen: html.length },
      ref: ref ? `render_pdf:${ref}` : undefined,
    });

    if (!charge.ok) {
      return okJson({ ok: false, error: "OUT_OF_CREDITS", balance: charge.balance }, { status: 402 });
    }

    chargedUserId = dbUser.id;
    charged = true;

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
    const msg = e?.message || "PDF render failed";
    console.error("render-pdf error:", e);

    // ✅ Refund if we charged but failed
    if (charged && chargedUserId) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: COST_PDF,
          reason: "refund_render_pdf_failed",
          eventType: "cover_letter",
          meta: { cost: COST_PDF, error: msg },
        });

        return okJson({ ok: false, error: msg, refunded: true, balance: refunded.balance }, { status: 500 });
      } catch (refundErr: any) {
        console.error("refundCredits failed:", refundErr);
        return okJson(
          { ok: false, error: msg, refunded: false, refundError: refundErr?.message || String(refundErr) },
          { status: 500 }
        );
      }
    }

    return okJson({ ok: false, error: msg }, { status: 500 });
  }
}
