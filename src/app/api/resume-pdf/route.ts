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
  let chargedCost = 0;
  let chargedUserId = "";
  let chargedBalanceAfter = 0;

  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return NextResponse.json({ ok: false, error: "User not found" }, { status: 401 });

    const body = (await req.json()) as Partial<Body>;
    const html = String(body.html ?? "");
    const filename = safeFilename(body.filename ?? "resume");

    if (!html.trim()) {
      return NextResponse.json({ ok: false, error: "Missing html" }, { status: 400 });
    }

    if (html.length > 1_200_000) {
      return NextResponse.json({ ok: false, error: "html too large" }, { status: 400 });
    }

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

    chargedCost = COST_PDF;
    chargedUserId = dbUser.id;
    chargedBalanceAfter = charged.balance;

    const deps = await loadBrowserDeps();

    if (!deps.executablePath) {
      throw new Error(
        "No executablePath for Chromium/Chrome was found. Set PUPPETEER_EXECUTABLE_PATH to your Chrome, or ensure puppeteer downloaded a browser."
      );
    }

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

      if (typeof page.emulateMediaType === "function") {
        await page.emulateMediaType("screen");
      }

      await page.setContent(html, { waitUntil: "networkidle0" });

      await page.addStyleTag({
        content: `
          html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          img { break-inside: avoid; page-break-inside: avoid; }
          .page, .resume-page, .resume-shell, .resume-preview-page { break-inside: avoid; page-break-inside: avoid; }
        `,
      });

      await page
        .evaluate(async () => {
          const fonts = (document as unknown as { fonts?: { ready?: Promise<void> } }).fonts;
          if (fonts?.ready) await fonts.ready;

          const images = Array.from(document.images || []);
          await Promise.all(
            images.map(async (img) => {
              try {
                if ((img as HTMLImageElement).decode) {
                  await (img as HTMLImageElement).decode();
                  return;
                }
              } catch {}

              if (!img.complete) {
                await new Promise<void>((resolve) => {
                  const done = () => resolve();
                  img.addEventListener("load", done, { once: true });
                  img.addEventListener("error", done, { once: true });
                  setTimeout(done, 1200);
                });
              }
            }),
          );
        })
        .catch(() => {});

      await new Promise((r) => setTimeout(r, 50));

      const pdfBytes = await page.pdf({
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0in", right: "0in", bottom: "0in", left: "0in" },
      });

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
