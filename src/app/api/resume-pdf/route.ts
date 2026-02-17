// src/app/api/resume-pdf/route.ts
import { NextResponse } from "next/server";
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
    const COST_PDF = 2;
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
    let puppeteer: PuppeteerModule;
    let chromium: ChromiumModule;

    ({ puppeteer, chromium } = await loadPdfDeps());

    if (typeof chromium.setHeadlessMode !== "undefined") chromium.setHeadlessMode = true;
    if (typeof chromium.setGraphicsMode !== "undefined") chromium.setGraphicsMode = false;

    const executablePath =
      (typeof chromium.executablePath === "function" ? await chromium.executablePath() : chromium.executablePath) ||
      process.env.CHROME_EXECUTABLE_PATH ||
      undefined;

    if (!executablePath) {
      throw new Error(
        "Chromium executablePath() was not resolved. Ensure @sparticuz/chromium is installed and supported in this environment."
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
          // Optional: expose balance so client can refresh without extra request
          "X-Credits-Balance": String(chargedBalanceAfter),
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
        // If refund fails, still return the failure (but tell yourself in logs)
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
