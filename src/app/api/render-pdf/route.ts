// src/app/api/render-pdf/route.ts
import { NextResponse } from "next/server";
import * as chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  html: string;
  filename?: string;
};

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

/**
 * ✅ chromium-min requires a remote "pack" URL on Vercel.
 * Set Vercel env var:
 *   CHROMIUM_REMOTE_EXEC_PATH=https://.../chromium-...-pack.tar.br
 *
 * We cache across warm invocations to avoid re-downloading.
 */
let cachedExecutablePath: string | null = null;
let downloading: Promise<string> | null = null;

async function resolveExecutablePath(): Promise<string> {
  if (cachedExecutablePath) return cachedExecutablePath;

  const remote = String(process.env.CHROMIUM_REMOTE_EXEC_PATH || "").trim();
  if (!remote) {
    throw new Error(
      "Missing CHROMIUM_REMOTE_EXEC_PATH. Set it in Vercel to a chromium-*-pack.tar.br URL."
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
  const executablePath = await resolveExecutablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true, // keep it simple + TS-friendly
  });

  try {
    const page = await browser.newPage();

    // Your HTML contains the template CSS already
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Ensure print CSS is applied
    await page.emulateMediaType("print");

    const pdfBuffer = await page.pdf({
      format: "Letter", // change to "A4" if you prefer
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

    const msg = String(e?.message || "PDF render failed");
    const hint =
      msg.includes("Unexpected status code: 404")
        ? "\n\nHint: Your CHROMIUM_REMOTE_EXEC_PATH URL is likely wrong (404), or not set in this environment (Preview/Prod)."
        : msg.includes("Missing CHROMIUM_REMOTE_EXEC_PATH")
        ? "\n\nHint: Set CHROMIUM_REMOTE_EXEC_PATH in Vercel (Production + Preview)."
        : "";

    return NextResponse.json({ ok: false, error: msg + hint }, { status: 500 });
  }
}
