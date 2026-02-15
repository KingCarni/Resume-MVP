// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

// cache across warm invocations (helps speed; avoids re-downloading pack repeatedly)
let cachedExecutablePath: string | null = null;
let downloading: Promise<string> | null = null;

function toPureArrayBuffer(input: Uint8Array | Buffer | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;

  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

function safePdfFilename(name: string) {
  const base = (name || "document.pdf").trim() || "document.pdf";
  const withExt = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return withExt.replace(/[\/\\<>:"|?*\x00-\x1F]/g, "_");
}

async function getExecutablePath() {
  if (cachedExecutablePath) return cachedExecutablePath;

  const remote = String(process.env.CHROMIUM_REMOTE_EXEC_PATH || "").trim();
  if (!remote) {
    throw new Error(
      "Missing CHROMIUM_REMOTE_EXEC_PATH env var. Set it in Vercel to a chromium-*-pack.tar.br URL."
    );
  }

  if (!downloading) {
    downloading = chromium.executablePath(remote).then((p) => {
      cachedExecutablePath = p;
      return p;
    });
  }

  return downloading;
}

async function renderPdfFromHtml(html: string): Promise<Uint8Array> {
  const executablePath = await getExecutablePath();

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
