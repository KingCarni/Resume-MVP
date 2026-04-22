// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
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
  ref?: string;
};

const COST_PDF = 5;

function okJson(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

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

    const brotliDir = path.join(process.cwd(), "node_modules", "@sparticuz", "chromium", "bin");
    let executablePath: string | undefined;

    if (exists(brotliDir)) {
      const p = await chromium.executablePath(brotliDir);
      if (p) executablePath = p;
    }

    if (!executablePath) {
      const p = await chromium.executablePath();
      if (p) executablePath = p;
    }

    if (!executablePath) {
      throw new Error(
        "Could not resolve chromium executablePath(). " +
          'Ensure next.config.ts has outputFileTracingIncludes: {"*": ["node_modules/@sparticuz/chromium/**"]} and redeploy.'
      );
    }

    return {
      puppeteer,
      chromiumArgs: chromium.args as string[],
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
    chromiumArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
    executablePath,
    source: executablePath && exists(executablePath) ? "local(dev):explicit-or-bundled" : "local(dev):unknown",
  };
}

async function renderPdfFromHtml(html: string): Promise<{ bytes: Uint8Array; debug: any }> {
  const deps = await loadBrowserDeps();

  const defaultViewport: any = null;

  const browser = await deps.puppeteer.launch({
    args: deps.chromiumArgs,
    executablePath: deps.executablePath,
    headless: deps.headless,
    defaultViewport,
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle2" });

    await page.evaluate(async () => {
      try {
        const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
        if (fonts?.ready) await fonts.ready;
      } catch {}

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
    });

    if (typeof page.emulateMediaType === "function") {
      await page.emulateMediaType("print");
    }

    await page.addStyleTag({
      content: `
        html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        img { break-inside: avoid; page-break-inside: avoid; }
        .page, .resume-page, .resume-shell, .resume-preview-page, .cover-letter-page { break-inside: avoid; page-break-inside: avoid; }
        .cover-header, .letter-card, .sig { break-inside: avoid-page; page-break-inside: avoid; }
      `,
    });

    const pdfBuffer = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    });

    return {
      bytes: new Uint8Array(pdfBuffer),
      debug: {
        browserSource: deps.source,
        executablePath: deps.executablePath,
      },
    };
  } finally {
    await browser.close();
  }
}

export async function POST(req: Request) {
  let chargedUserId = "";
  let charged = false;

  try {
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

    const charge = await chargeCredits({
      userId: dbUser.id,
      cost: COST_PDF,
      reason: "render_pdf",
      eventType: "cover_letter",
      meta: { cost: COST_PDF, filename, htmlLen: html.length },
      ref: ref ? `render_pdf:${ref}` : undefined,
    });

    if (!charge.ok) {
      return okJson({ ok: false, error: "OUT_OF_CREDITS", balance: charge.balance }, { status: 402 });
    }

    chargedUserId = dbUser.id;
    charged = true;

    const { bytes, debug } = await renderPdfFromHtml(html);
    const ab = toPureArrayBuffer(bytes);

    return new NextResponse(ab, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-PDF-Engine": String(debug?.browserSource ?? ""),
      },
    });
  } catch (e: any) {
    const msg = e?.message || "PDF render failed";
    console.error("render-pdf error:", e);

    if (charged && chargedUserId) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: COST_PDF,
          reason: "refund_render_pdf_failed",
          eventType: "cover_letter",
          meta: { cost: COST_PDF, error: msg },
        });

        return okJson(
          {
            ok: false,
            error: msg,
            refunded: true,
            balance: refunded.balance,
          },
          { status: 500 }
        );
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
