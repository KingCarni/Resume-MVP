// src/app/api/resume-pdf/route.ts
import { NextResponse } from "next/server";
import fs from "fs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits } from "@/lib/credits";

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

function isVercelLike() {
  return !!process.env.VERCEL || process.env.NODE_ENV === "production";
}

function exists(p?: string) {
  if (!p) return false;
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

async function loadBrowserDeps() {
  if (isVercelLike()) {
    const puppeteerImport = (await import("puppeteer-core")) as any;
    const chromiumImport = (await import("@sparticuz/chromium")) as any;

    const puppeteer = puppeteerImport.default ?? puppeteerImport;
    const chromium = chromiumImport.default ?? chromiumImport;

    if (typeof chromium.setHeadlessMode !== "undefined") chromium.setHeadlessMode = true;
    if (typeof chromium.setGraphicsMode !== "undefined") chromium.setGraphicsMode = false;

    const executablePath =
      (typeof chromium.executablePath === "function" ? await chromium.executablePath() : chromium.executablePath) ||
      undefined;

    if (!executablePath) {
      throw new Error(
        "Chromium executablePath() was not resolved. Ensure @sparticuz/chromium is installed and supported in this environment."
      );
    }

    return {
      puppeteer,
      args: chromium.args as string[],
      headless: chromium.headless ?? true,
      executablePath,
      source: "sparticuz(production)",
    };
  }

  // ✅ Local dev: use full puppeteer (bundled Chromium), OR local Chrome via env
  const puppeteerImport = (await import("puppeteer")) as any;
  const puppeteer = puppeteerImport.default ?? puppeteerImport;

  const envPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXEC_PATH;

  const winChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const executablePath =
    (envPath && exists(envPath) ? envPath : undefined) ||
    (exists(winChrome) ? winChrome : undefined) ||
    (typeof puppeteer.executablePath === "function" ? puppeteer.executablePath() : undefined);

  return {
    puppeteer,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
    executablePath,
    source: executablePath && exists(executablePath) ? "local(dev):explicit-or-bundled" : "local(dev):unknown",
  };
}

export async function POST(req: Request) {
  // Track whether we charged so we can refund on any failure after the charge.
  let chargedCost = 0;
  let chargedUserId = "";
  let chargedBalanceAfter = 0;

  try {
    // ✅ Require login
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });

    // ✅ Parse + validate BEFORE charging
    const body = (await req.json()) as Partial<Body>;
    const html = String(body.html ?? "");
    const filename = safeFilename(body.filename ?? "resume");

    if (!html.trim()) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    // Optional sanity limit (prevents megabytes of HTML)
    if (html.length > 1_200_000) {
      return NextResponse.json({ ok: false, error: "html too large" }, { status: 400 });
    }

    // ✅ Charge credits
    const COST_PDF = 5;
    const charged = await chargeCredits({
      userId: dbUser.id,
      cost: COST_PDF,
      reason: "resume_pdf",
      eventType: "resume_pdf",
      meta: { cost: COST_PDF, htmlLen: html.length, filename },
    });

    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "OUT_OF_CREDITS", balance: charged.balance }, { status: 402 });
    }

    // Record for potential refund
    chargedCost = COST_PDF;
    chargedUserId = dbUser.id;
    chargedBalanceAfter = charged.balance;

    // --- Render PDF ---
    const deps = await loadBrowserDeps();

    if (!deps.executablePath) {
      throw new Error(
        "No executablePath for Chromium/Chrome was found. Set PUPPETEER_EXECUTABLE_PATH to your Chrome, or ensure puppeteer downloaded a browser."
      );
    }

    // Letter @ 96dpi
    const LETTER_W = 816;
    const LETTER_H = 1056;

    const browser = await deps.puppeteer.launch({
      args: deps.args,
      executablePath: deps.executablePath,
      headless: deps.headless,
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
          "X-Credits-Balance": String(chargedBalanceAfter),
          "X-PDF-Engine": deps.source,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);

    // ✅ Refund if we already charged and something failed afterward
    if (chargedCost > 0 && chargedUserId) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_resume_pdf_failed",
          eventType: "resume_pdf",
          meta: { error: message, cost: chargedCost },
        });

        return NextResponse.json(
          {
            ok: false,
            error: message || "PDF export failed",
            refunded: true,
            balance: refunded.balance,
          },
          { status: 500 }
        );
      } catch (refundErr: any) {
        console.error("refundCredits failed:", refundErr);
        return NextResponse.json(
          {
            ok: false,
            error: message || "PDF export failed",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: false, error: message || "PDF export failed" }, { status: 500 });
  }
}