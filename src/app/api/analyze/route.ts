// src/app/api/analyze/route.ts
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";
import { computeVerbStrength } from "@/lib/verb_strength";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits } from "@/lib/credits";

import { ocrPdfWithGoogleVision } from "@/lib/pdf_ocr_google";
import { assessPdfTextQuality } from "@/lib/pdf_quality";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BOOT_TAG = "analyze_route_boot_ok";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

const PDF_WEIRD_WARNING = "PDF looks weird; DOCX recommended — we’ll still try to extract.";

type ResumeBullet = {
  id: string;
  text: string;
  jobId?: string;
};

function okJson(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeJobText(input: unknown) {
  return String(input ?? "").replace(/\s+/g, " ").trim();
}

function normalizeResumeText(input: unknown) {
  const raw = String(input ?? "");
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ---------------- DOCX helpers (preserve list bullets) ---------------- */

function stripTagsToText(html: string) {
  return String(html ?? "")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|td|th)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeResumeInput(input: unknown) {
  const s = String(input ?? "");
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(s);
  const stripped = looksHtml ? stripTagsToText(s) : s;
  return normalizeResumeText(stripped);
}

/** ---------------- Safety filters (contact / references) ---------------- */

function digitsCount(s: string) {
  const m = String(s || "").match(/\d/g);
  return m ? m.length : 0;
}

function normalizeForContains(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function looksLikeContactOrReferenceLine(line: string) {
  const l = String(line || "").trim();
  if (!l) return true;

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRegex = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
  const linkedinRegex = /\blinkedin\.com\/in\/\S+/i;

  if (emailRegex.test(l)) return true;
  if (linkedinRegex.test(l)) return true;
  if (urlRegex.test(l)) return true;

  if (digitsCount(l) >= 7) return true;

  if (/^references?$/i.test(l)) return true;
  if (/available\s+upon\s+request/i.test(l)) return true;

  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(l)) return true;

  if (/^(massage therapist|production manager|2\s*nd\s*ad)\b/i.test(l)) return true;

  return false;
}

function filterBadBullets(arr: string[]) {
  return (arr || [])
    .map((b) => String(b || "").trim())
    .filter(Boolean)
    .filter((b) => !looksLikeContactOrReferenceLine(b));
}

/** ---------------- Common cleanup ---------------- */

function cleanLeadingBulletGarbage(s: string) {
  // ✅ Added ● (U+25CF) because many web/ATS PDFs use it
  return String(s || "").replace(/^[\s•●\u2022\u00B7o-]+/g, "").trim();
}

/** ---------------- FIX: robust job parsing from experience text ---------------- */

function looksLikeDateRangeLine(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  if (!line) return false;

  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const dash = "[–—-]";
  const re = new RegExp(`\\b${month}\\s+${year}\\s*${dash}\\s*(${month}\\s+${year}|present|current)\\b`, "i");
  return re.test(line);
}

/**
 * Baseline header format you already had:
 *   "Title — Company | Dates"
 */
function looksLikeJobHeaderLine(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  if (!line) return false;

  if (!(line.includes("—") || line.includes("-"))) return false;
  if (!line.includes("|")) return false;

  const headerRegex = /^(.{2,140}?)\s*(—|-)\s*(.{2,220}?)\s*\|\s*(.{0,80})$/;
  return headerRegex.test(line);
}

function parseJobHeaderLine(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  const headerRegex = /^(.{2,140}?)\s*(—|-)\s*(.{2,220}?)\s*\|\s*(.{0,80})$/;
  const m = line.match(headerRegex);
  if (!m) return null;

  const title = String(m[1] || "").trim();
  const company = String(m[3] || "").trim();
  const datesInline = String(m[4] || "").trim();

  return { title, company, datesInline };
}

/**
 * ✅ NEW (safe) header format for many web PDFs:
 *   "Company, Location - Title"
 *   "Company - Title"
 *
 * This is ONLY used for preview job headings (experienceJobs),
 * NOT for bullet extraction, so it won't break bullets.
 */
function looksLikeCompanyDashTitleHeader(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  if (!line) return false;

  // Avoid bullets
  if (/^[\s]*[•●\u2022\u00B7o-]\s+/.test(line)) return false;
  // Avoid section headers
  if (/^(highlights|experience|education|skills|projects|certifications|certificates|volunteer|interests)\b/i.test(line))
    return false;

  if (!line.includes(" - ") && !line.includes(" — ")) return false;
  if (line.includes("|")) return false; // that's the other format

  // Keep conservative length
  if (line.length < 8 || line.length > 170) return false;

  // Must look like "Something - Something"
  const normalized = line.replace(/\s+—\s+/g, " - ");
  const idx = normalized.indexOf(" - ");
  if (idx <= 0) return false;

  const left = normalized.slice(0, idx).trim();
  const right = normalized.slice(idx + 3).trim();
  if (!left || !right) return false;

  // Right side should resemble a title-ish phrase
  if (right.split(/\s+/).length < 2) return false;

  return true;
}

function parseCompanyDashTitleHeader(lineRaw: string) {
  const line = String(lineRaw || "").trim();
  const normalized = line.replace(/\s+—\s+/g, " - ");
  const idx = normalized.indexOf(" - ");
  if (idx <= 0) return null;

  const company = normalized.slice(0, idx).trim();
  const title = normalized.slice(idx + 3).trim();
  if (!company || !title) return null;

  return { company, title };
}

function looksLikeMetaLine(s: string) {
  const t = String(s || "").trim();
  if (!t) return true;

  if (/^(highlights|experience|education|skills|projects|certifications|certificates|volunteer|interests)\b/i.test(t))
    return true;

  if (/^games shipped\s*:/i.test(t)) return true;
  if (/^tools\s*:/i.test(t)) return true;

  if (/^experi\s*e\s*n\s*ce$/i.test(t.replace(/\s+/g, ""))) return true;

  return false;
}

function buildExperienceJobsForPreviewFromText(experienceText: string) {
  const lines = normalizeResumeText(experienceText)
    .split("\n")
    .map((l) => String(l || "").trim());

  const jobs: any[] = [];
  let current: any | null = null;

  // pending header -> next line dates
  let pendingHeader: { title: string; company: string } | null = null;

  const pushCurrent = () => {
    if (current && Array.isArray(current.bullets) && current.bullets.length) jobs.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = String(raw || "").trim();
    if (!line) continue;

    // pending header gets dates from next line if present
    if (pendingHeader && looksLikeDateRangeLine(line)) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: pendingHeader.company,
        title: pendingHeader.title,
        dates: line.trim(),
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    // Format A: "Title — Company | Dates"
    if (looksLikeJobHeaderLine(line)) {
      const parsed = parseJobHeaderLine(line);
      if (parsed) {
        const dates = parsed.datesInline;

        if (!dates) {
          pendingHeader = { title: parsed.title, company: parsed.company };
          continue;
        }

        pushCurrent();
        current = {
          id: `job_${jobs.length + 1}`,
          company: parsed.company,
          title: parsed.title,
          dates: dates,
          location: "",
          bullets: [],
        };
        pendingHeader = null;
      }
      continue;
    }

    // Format B: "Company - Title" (dates usually next line)
    if (looksLikeCompanyDashTitleHeader(line)) {
      const parsed = parseCompanyDashTitleHeader(line);
      if (parsed) {
        pendingHeader = { title: parsed.title, company: parsed.company };
        continue;
      }
    }

    // if pending header but we didn't see a date-range line, start job anyway
    if (pendingHeader) {
      pushCurrent();
      current = {
        id: `job_${jobs.length + 1}`,
        company: pendingHeader.company,
        title: pendingHeader.title,
        dates: "",
        location: "",
        bullets: [],
      };
      pendingHeader = null;
      // and then keep going to possibly treat this line as a bullet below
    }

    if (!current) continue;

    if (looksLikeMetaLine(line)) continue;
    if (looksLikeContactOrReferenceLine(line)) continue;

    // ✅ include ● bullets too
    const isGlyphBullet = /^[•●\u2022\u00B7o-]\s+/.test(line);
    const cleaned = isGlyphBullet ? cleanLeadingBulletGarbage(line) : line;

    const candidate = String(cleaned || "").trim();
    if (!candidate) continue;
    if (candidate.length < 12) continue;

    current.bullets.push(candidate);
  }

  if (pendingHeader) {
    pushCurrent();
    current = {
      id: `job_${jobs.length + 1}`,
      company: pendingHeader.company,
      title: pendingHeader.title,
      dates: "",
      location: "",
      bullets: [],
    };
    pendingHeader = null;
  }
  pushCurrent();

  for (const j of jobs) {
    const seen = new Set<string>();
    j.bullets = (j.bullets || []).filter((b: string) => {
      const k = normalizeForContains(b);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  return jobs;
}

function jobsLookPlaceholder(jobs: any[]) {
  const arr = Array.isArray(jobs) ? jobs : [];
  if (!arr.length) return true;

  let placeholderCount = 0;

  for (const j of arr) {
    const company = String(j?.company ?? "").trim();
    const title = String(j?.title ?? "").trim();
    const dates = String(j?.dates ?? "").trim();

    const isPlaceholder =
      !company ||
      !title ||
      company === "Company" ||
      title === "Role" ||
      dates === "Dates" ||
      (dates.length === 0 && (company === "Company" || title === "Role"));

    if (isPlaceholder) placeholderCount++;
  }

  return placeholderCount / arr.length >= 0.4;
}

/** ---------------- Magic-byte sniffing ---------------- */

type SniffedType = "pdf" | "docx" | "doc" | "txt" | "unknown";

function startsWith(buf: Buffer, bytes: number[]) {
  if (!Buffer.isBuffer(buf)) return false;
  if (buf.length < bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buf[i] !== bytes[i]) return false;
  }
  return true;
}

function sniffBufferType(buf: Buffer): SniffedType {
  if (buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "docx";
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";

  const head = buf.slice(0, Math.min(buf.length, 4096));
  if (head.length) {
    let printable = 0;
    for (const b of head) {
      if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e)) printable++;
    }
    const ratio = printable / head.length;
    if (ratio > 0.92) return "txt";
  }

  return "unknown";
}

function friendlyUnsupportedDocMsg(extra?: string) {
  return (
    "Unsupported Word format (.doc). Please convert it to .docx or export to PDF, then upload again." +
    (extra ? ` ${extra}` : "")
  );
}

function extractLiText(html: string): string[] {
  const matches = [...String(html ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const bullets = matches
    .map((m) => stripTagsToText(m[1]))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(bullets));
}

async function extractDocxTextAndBulletsFromBuffer(
  buffer: Buffer
): Promise<{ text: string; bullets: string[]; html: string }> {
  const sniffed = sniffBufferType(buffer);
  if (sniffed !== "docx") {
    if (sniffed === "doc") throw new Error(friendlyUnsupportedDocMsg());
    throw new Error(`File is not a valid .docx (zip). Detected: ${sniffed}. Please upload a real DOCX or PDF.`);
  }

  const { value: html } = await mammoth.convertToHtml({ buffer });
  const bullets = extractLiText(html);

  const text = stripTagsToText(html);
  const textWithBullets = bullets.length > 0 ? `${text}\n\n${bullets.map((b) => `- ${b}`).join("\n")}` : text;

  return { text: textWithBullets, bullets, html };
}

/** ---------------- Experience section slicing ---------------- */

function extractExperienceSection(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lower = text.toLowerCase();

  const endHeadingRegex =
    /\n\s*(skills|personal skills|technical skills|certificates|certifications|education|projects|references|achievements|training|volunteer|interests)\b/i;

  const startNeedles = ["professional experience", "work experience", "employment history", "experience"];

  let bestStartIdx = -1;
  let bestNeedle = "";
  for (const needle of startNeedles) {
    const idx = lower.indexOf(needle);
    if (idx !== -1 && (bestStartIdx === -1 || idx < bestStartIdx)) {
      bestStartIdx = idx;
      bestNeedle = needle;
    }
  }

  if (bestStartIdx !== -1) {
    const afterStart = text.slice(bestStartIdx);
    const endMatch = afterStart.match(endHeadingRegex);
    const endIdx = endMatch?.index;

    const experienceText = typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

    return { experienceText: normalizeResumeText(experienceText), foundSection: true, mode: `heading:${bestNeedle}` };
  }

  const lines = text.split("\n");
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const dash = "[–—-]";
  const dateRangeRegex = new RegExp(
    `\\b${month}\\s+${year}\\s*${dash}\\s*(${month}\\s+${year}|present|current)\\b`,
    "i"
  );

  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (dateRangeRegex.test(l) && l.length >= 14) {
      startLine = i;
      break;
    }
  }

  if (startLine === -1) return { experienceText: text, foundSection: false, mode: "none" };

  const afterStart = lines.slice(startLine).join("\n");
  const endMatch = afterStart.match(endHeadingRegex);
  const endIdx = endMatch?.index;

  const experienceText = typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

  return { experienceText: normalizeResumeText(experienceText), foundSection: true, mode: "heuristic" };
}

/** Option B: capture metadata blocks (not bullets) */
function extractMetaBlocks(fullText: string) {
  const text = normalizeResumeText(fullText);

  const lines = text
    .split("\n")
    .map((l) => cleanLeadingBulletGarbage(l))
    .map((l) => l.trim())
    .filter(Boolean);

  const gamesShippedRegex = /^(\u{1F3AE}\s*)?games shipped:/iu;
  const metricLikeRegex =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b)/i;

  const gamesShipped: string[] = [];
  const metrics: string[] = [];

  const seenGames = new Set<string>();
  const seenMetrics = new Set<string>();

  for (const l0 of lines) {
    const l = l0.replace(/\s+/g, " ").trim();
    if (!l) continue;

    if (gamesShippedRegex.test(l)) {
      const k = normalizeForContains(l);
      if (!seenGames.has(k)) {
        seenGames.add(k);
        gamesShipped.push(l);
      }
      continue;
    }

    if (l.length <= 110 && metricLikeRegex.test(l)) {
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}\b/i.test(l)) continue;
      if (/\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/.test(l)) continue;

      const k = normalizeForContains(l);
      if (!seenMetrics.has(k)) {
        seenMetrics.add(k);
        metrics.push(l);
      }
      continue;
    }
  }

  return {
    gamesShipped: Array.from(new Set(gamesShipped)).slice(0, 30),
    metrics: Array.from(new Set(metrics)).slice(0, 50),
  };
}

/** ---------------- PDF extraction (pdfjs baseline) ---------------- */

async function ensurePdfJsPolyfills() {
  if (!(globalThis as any).DOMMatrix) {
    try {
      const dm: any = await import("dommatrix");
      (globalThis as any).DOMMatrix = dm?.DOMMatrix ?? dm?.default ?? dm;
    } catch {
      // ignore
    }
  }
  if (!(globalThis as any).Path2D) {
    (globalThis as any).Path2D = class Path2DStub {};
  }
  if (!(globalThis as any).ImageData) {
    (globalThis as any).ImageData = class ImageDataStub {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: any, width: number, height?: number) {
        this.data = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data || []);
        this.width = Number(width || 0);
        this.height = Number(height ?? 0);
      }
    };
  }
}

function normalizePdfText(s: string) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\b([a-z])\s+([a-z]{1,2})\s+([a-z])\b/gi, "$1$2$3")
    .replace(/[ \t]+/g, " ")
    .trim();
}

type PdfItem = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hasEOL: boolean;
};

type PdfLine = {
  y: number;
  xMin: number;
  xMax: number;
  parts: { x: number; text: string }[];
};

function buildItemsFromTextContentItems(items: any[]): PdfItem[] {
  const out: PdfItem[] = [];
  for (const it of items) {
    const raw = String(it?.str ?? "");
    const text = normalizePdfText(raw);
    if (!text && !it?.hasEOL) continue;

    const tr = Array.isArray(it?.transform) ? it.transform : null;
    const x = tr ? Number(tr[4] ?? 0) : 0;
    const y = tr ? Number(tr[5] ?? 0) : 0;

    const w = Number(it?.width ?? 0);
    const h = Number(it?.height ?? 0);
    const hasEOL = Boolean(it?.hasEOL);

    out.push({ str: text, x, y, w, h, hasEOL });
  }
  return out;
}

function groupItemsIntoLines(items: PdfItem[]) {
  const sorted = [...items].sort((a, b) => {
    if (b.y !== a.y) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: PdfLine[] = [];
  const Y_TOL = 2.25;

  for (const it of sorted) {
    if (!it.str && !it.hasEOL) continue;

    let line = lines.find((l) => Math.abs(l.y - it.y) <= Y_TOL);
    if (!line) {
      line = { y: it.y, xMin: it.x, xMax: it.x + (it.w || 0), parts: [] };
      lines.push(line);
    }

    if (it.str) {
      line.parts.push({ x: it.x, text: it.str });
      line.xMin = Math.min(line.xMin, it.x);
      line.xMax = Math.max(line.xMax, it.x + (it.w || 0));
    }
  }

  const normalized: { y: number; xMin: number; xMax: number; text: string }[] = [];

  for (const l of lines) {
    const parts = [...l.parts].sort((a, b) => a.x - b.x);

    let s = "";
    let lastX: number | null = null;

    for (const p of parts) {
      const t = normalizePdfText(p.text);
      if (!t) continue;

      if (s.length === 0) {
        s = t;
        lastX = p.x;
        continue;
      }

      const gap = lastX == null ? 0 : p.x - lastX;
      if (gap > 6) s += " ";

      if (!s.endsWith(" ") && !/^[,.:;)\]]/.test(t) && !/[([/]\s*$/.test(s)) s += " ";

      s += t;
      lastX = p.x;
    }

    const text = normalizePdfText(s);
    if (!text) continue;

    normalized.push({ y: l.y, xMin: l.xMin, xMax: l.xMax, text });
  }

  normalized.sort((a, b) => b.y - a.y);
  return normalized;
}

function splitIntoColumnsIfNeeded(lines: { y: number; xMin: number; xMax: number; text: string }[]) {
  if (lines.length < 8) return { mode: "single" as const, columns: [lines] };

  const xMins = lines.map((l) => l.xMin).sort((a, b) => a - b);
  const medianXMin = xMins[Math.floor(xMins.length / 2)] ?? 0;

  const maxXMin = xMins[xMins.length - 1] ?? 0;
  const spread = maxXMin - medianXMin;

  if (spread < 140) return { mode: "single" as const, columns: [lines] };

  const splitX = medianXMin + Math.min(180, Math.max(120, spread * 0.55));

  const left: typeof lines = [];
  const right: typeof lines = [];

  for (const l of lines) {
    const mid = (l.xMin + l.xMax) / 2;
    if (mid >= splitX) right.push(l);
    else left.push(l);
  }

  if (right.length <= Math.max(3, Math.floor(lines.length * 0.12))) {
    return { mode: "single" as const, columns: [lines] };
  }

  return { mode: "two-column" as const, columns: [left, right] };
}

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    await ensurePdfJsPolyfills();

    if (!(globalThis as any).DOMMatrix) {
      throw new Error("DOMMatrix is not defined (polyfill failed).");
    }

    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

    if (pdfjs?.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
    }

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      useSystemFonts: true,
      disableFontFace: true,
    });

    const pdf = await loadingTask.promise;

    let out = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const rawItems: any[] = Array.isArray(content?.items) ? content.items : [];
      if (!rawItems.length) {
        out += "\n\n";
        continue;
      }

      const items = buildItemsFromTextContentItems(rawItems);
      const lines = groupItemsIntoLines(items);

      const col = splitIntoColumnsIfNeeded(lines);

      const pageText =
        col.columns
          .map((colLines) => colLines.map((l) => l.text).join("\n"))
          .join("\n\n") + "\n\n";

      out += pageText;
    }

    return normalizeResumeText(out);
  } catch (err: any) {
    const msg = err?.message ? String(err.message) : String(err);
    throw new Error(`PDF parse failed: ${msg}`);
  }
}

/** ---------------- PDF extraction (gated OCR fallback) ---------------- */

type PdfExtractionResult = {
  text: string;
  parserUsed: "pdfjs" | "vision_ocr";
  warnings: string[];
  pdfInfo: {
    pdfQuality?: ReturnType<typeof assessPdfTextQuality>;
    pdfjsError?: string | null;
    ocrPages?: number | null;
    gcsInputUri?: string;
    gcsOutputPrefix?: string;
  };
};

async function extractResumeTextFromPdfWithOcrGate(buffer: Buffer): Promise<PdfExtractionResult> {
  const warnings: string[] = [];
  let pdfjsText = "";
  let pdfjsError: string | null = null;

  // Always TRY pdfjs first (cheap)
  try {
    pdfjsText = await extractTextFromPdfBuffer(buffer);
  } catch (e: any) {
    pdfjsError = e?.message ? String(e.message) : String(e);
    warnings.push(PDF_WEIRD_WARNING);
  }

  // If pdfjs succeeded, assess quality
  let quality = pdfjsText ? assessPdfTextQuality(pdfjsText) : null;

  // If pdfjs failed OR quality is bad -> OCR
  if (!pdfjsText || (quality && !quality.ok)) {
    warnings.push(PDF_WEIRD_WARNING);

    const ocr = await ocrPdfWithGoogleVision(buffer);
    const ocrText = normalizeResumeText(ocr.text);

    return {
      text: ocrText,
      parserUsed: "vision_ocr",
      warnings: Array.from(new Set(warnings)),
      pdfInfo: {
        pdfQuality: quality ?? undefined,
        pdfjsError,
        ocrPages: ocr.pages ?? null,
        gcsInputUri: ocr.gcsInputUri,
        gcsOutputPrefix: ocr.gcsOutputPrefix,
      },
    };
  }

  // Good enough from pdfjs
  return {
    text: normalizeResumeText(pdfjsText),
    parserUsed: "pdfjs",
    warnings: [],
    pdfInfo: {
      pdfQuality: quality ?? undefined,
      pdfjsError: null,
      ocrPages: null,
    },
  };
}

/** ---------------- File extraction ---------------- */

async function extractResumeFromFile(file: File): Promise<{
  text: string;
  bulletsFromFile?: string[];
  detectedType: string;
  parserUsed?: "pdfjs" | "vision_ocr";
  warnings?: string[];
  pdfInfo?: any;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffBufferType(buffer);

  if (sniffed === "pdf") {
    const gated = await extractResumeTextFromPdfWithOcrGate(buffer);
    return {
      text: gated.text,
      bulletsFromFile: undefined,
      detectedType: "pdf",
      parserUsed: gated.parserUsed,
      warnings: gated.warnings,
      pdfInfo: gated.pdfInfo,
    };
  }

  if (sniffed === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets, detectedType: "docx" };
  }

  if (sniffed === "doc") throw new Error(friendlyUnsupportedDocMsg());

  if (sniffed === "txt") return { text: buffer.toString("utf8"), bulletsFromFile: undefined, detectedType: "txt" };

  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".doc")) throw new Error(friendlyUnsupportedDocMsg("(It looks like a legacy Word .doc file.)"));

  throw new Error("Unsupported file type. Please upload a PDF or DOCX.");
}

/** ---------------- Blob URL extraction ---------------- */

function inferExtFromUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "pdf";
  if (clean.endsWith(".docx")) return "docx";
  if (clean.endsWith(".doc")) return "doc";
  if (clean.endsWith(".txt")) return "txt";
  return "";
}

function inferTypeFromContentType(ct: string) {
  const c = (ct || "").toLowerCase();
  if (c.includes("application/pdf")) return "pdf";
  if (c.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) return "docx";
  if (c.includes("application/msword")) return "doc";
  if (c.includes("text/plain")) return "txt";
  return "";
}

async function fetchBlobAsBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const tryFetch = async (withAuth: boolean) => {
    const headers: Record<string, string> = {};
    if (withAuth) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(url, { headers, cache: "no-store" });
  };

  let res = await tryFetch(false);

  if (!res.ok && (res.status === 401 || res.status === 403)) {
    res = await tryFetch(true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to fetch resumeBlobUrl. Status ${res.status}. ${text ? `Body: ${text}` : ""}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);

  return { buffer, contentType };
}

async function extractResumeFromUrl(resumeBlobUrl: string): Promise<{
  text: string;
  bulletsFromFile?: string[];
  sizeBytes: number;
  detectedType: string;
  parserUsed?: "pdfjs" | "vision_ocr";
  warnings?: string[];
  pdfInfo?: any;
}> {
  const { buffer, contentType } = await fetchBlobAsBuffer(resumeBlobUrl);

  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `File too large. Max size is ${MAX_FILE_MB}MB. Uploaded file is ${(buffer.byteLength / (1024 * 1024)).toFixed(
        2
      )}MB.`
    );
  }

  const sniffed = sniffBufferType(buffer);
  const typeFromCt = inferTypeFromContentType(contentType);
  const typeFromUrl = inferExtFromUrl(resumeBlobUrl);

  const detectedType = sniffed !== "unknown" ? sniffed : typeFromCt || typeFromUrl || "unknown";

  if (detectedType === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets, sizeBytes: buffer.byteLength, detectedType };
  }

  if (detectedType === "pdf") {
    const gated = await extractResumeTextFromPdfWithOcrGate(buffer);
    return {
      text: gated.text,
      bulletsFromFile: undefined,
      sizeBytes: buffer.byteLength,
      detectedType,
      parserUsed: gated.parserUsed,
      warnings: gated.warnings,
      pdfInfo: gated.pdfInfo,
    };
  }

  if (detectedType === "doc") {
    throw new Error(
      friendlyUnsupportedDocMsg(`(Detected content-type "${contentType || "unknown"}", url "${resumeBlobUrl}")`)
    );
  }

  if (detectedType === "txt") {
    return { text: buffer.toString("utf8"), bulletsFromFile: undefined, sizeBytes: buffer.byteLength, detectedType };
  }

  throw new Error(
    `Unsupported resumeBlobUrl file type. Detected "${detectedType}". Content-Type was "${contentType || "unknown"}".`
  );
}

function parseOnlyExperienceFlagFromFormData(v: FormDataEntryValue | null) {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "on") return true;
  if (s === "false" || s === "0" || s === "off") return false;
  return undefined;
}

function normalizeBulletsForSuggestions(args: { bullets: string[]; bulletJobIds?: string[]; fallbackJobId?: string }) {
  const { bullets, bulletJobIds, fallbackJobId } = args;

  return (bullets || [])
    .map((t0, i) => {
      const text = String(t0 || "").trim();
      if (!text) return null;

      const jobId = bulletJobIds?.[i] || fallbackJobId || "job_default";
      const b: ResumeBullet = { id: `b${i + 1}`, text, jobId };
      return b;
    })
    .filter((x): x is ResumeBullet => Boolean(x));
}

function flattenFromJobs(jobsIn: any[]) {
  const outBullets: string[] = [];
  const outJobIds: string[] = [];

  for (const job of Array.isArray(jobsIn) ? jobsIn : []) {
    for (const b of Array.isArray(job?.bullets) ? job.bullets : []) {
      const t = String(b || "").trim();
      if (!t) continue;
      outBullets.push(t);
      outJobIds.push(String(job?.id ?? "job_default"));
    }
  }

  return { outBullets, outJobIds };
}

/**
 * ✅ NEW: last-resort bullet scan for PDFs with weird glyph bullets (●)
 * Only runs if all other extraction paths found zero bullets.
 */
function scanBulletsFromTextFallback(text: string) {
  const lines = normalizeResumeText(text)
    .split("\n")
    .map((l) => String(l || "").trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  // bullet markers: • ● - o (very common in exported PDFs)
  const bulletRe = /^[\s]*([•●\u2022\u00B7o-])\s+/;

  for (const line of lines) {
    if (!bulletRe.test(line)) continue;

    const cleaned = cleanLeadingBulletGarbage(line);
    const candidate = String(cleaned || "").trim();
    if (!candidate) continue;
    if (candidate.length < 12) continue;
    if (looksLikeContactOrReferenceLine(candidate)) continue;
    if (looksLikeMetaLine(candidate)) continue;

    const k = normalizeForContains(candidate);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(candidate);
  }

  return out;
}

/** --------- Route --------- */

export async function POST(req: Request) {
  console.log(BOOT_TAG, { at: new Date().toISOString() });

  let chargedUserId = "";
  let chargedCost = 0;

  try {
    const contentType = req.headers.get("content-type") || "";

    // ✅ Require login
    const session = await getServerSession(authOptions);
    const email = session?.user?.email;
    if (!email) return okJson({ ok: false, error: "Unauthorized" }, { status: 401 });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return okJson({ ok: false, error: "User not found" }, { status: 401 });

    let resumeText = "";
    let jobText = "";
    let onlyExperienceBullets: boolean = true;

    let bulletsFromFile: string[] = [];
    let blobDebug: any = null;

    // OCR/pdf debug
    const warnings: string[] = [];
    let parserUsed: "pdfjs" | "vision_ocr" | "mammoth" | "txt" | "unknown" = "unknown";
    let pdfInfo: any = null;
    let detectedType: string = "unknown";

    // --- Parse inputs (DO NOT charge yet) ---
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();

      const file = form.get("file");
      const resumeTextFallback = form.get("resumeText");
      const job = form.get("jobText") ?? form.get("jobPostingText");

      const flagRaw = form.get("onlyExperienceBullets");
      const parsedFlag = parseOnlyExperienceFlagFromFormData(flagRaw);
      if (typeof parsedFlag === "boolean") onlyExperienceBullets = parsedFlag;

      jobText = normalizeJobText(job);

      if (file && file instanceof File) {
        if (file.size > MAX_FILE_BYTES) {
          return okJson(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: export an optimized PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }

        const extracted = await extractResumeFromFile(file);
        detectedType = extracted.detectedType;

        resumeText = sanitizeResumeInput(extracted.text);

        if (extracted.parserUsed) parserUsed = extracted.parserUsed;
        if (Array.isArray(extracted.warnings)) warnings.push(...extracted.warnings);
        if (extracted.pdfInfo) pdfInfo = extracted.pdfInfo;

        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];

        if (!extracted.parserUsed) {
          parserUsed = detectedType === "docx" ? "mammoth" : detectedType === "txt" ? "txt" : "unknown";
        }
      } else {
        resumeText = sanitizeResumeInput(resumeTextFallback);
        parserUsed = "unknown";
      }
    } else if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as any;

      const resumeBlobUrl = String(body.resumeBlobUrl ?? "").trim();
      jobText = normalizeJobText(body.jobText ?? body.jobPostingText);

      if (typeof body.onlyExperienceBullets === "boolean") {
        onlyExperienceBullets = body.onlyExperienceBullets;
      }

      if (resumeBlobUrl) {
        const extracted = await extractResumeFromUrl(resumeBlobUrl);
        detectedType = extracted.detectedType;

        resumeText = sanitizeResumeInput(extracted.text);

        if (extracted.parserUsed) parserUsed = extracted.parserUsed;
        if (Array.isArray(extracted.warnings)) warnings.push(...extracted.warnings);
        if (extracted.pdfInfo) pdfInfo = extracted.pdfInfo;

        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];

        blobDebug = {
          usedBlobUrl: true,
          detectedType: extracted.detectedType,
          sizeBytes: extracted.sizeBytes,
          url: resumeBlobUrl,
          parserUsed: extracted.parserUsed ?? null,
        };

        const extra = sanitizeResumeInput(body.resumeText);
        if (extra && extra.length >= 200 && extra !== resumeText) {
          resumeText = `${resumeText}\n\n${extra}`;
          blobDebug.appendedResumeText = true;
        }

        if (!extracted.parserUsed) {
          parserUsed = detectedType === "docx" ? "mammoth" : detectedType === "txt" ? "txt" : "unknown";
        }
      } else {
        resumeText = sanitizeResumeInput(body.resumeText);
        parserUsed = "unknown";
      }
    } else {
      return okJson(
        { ok: false, error: "Unsupported content type. Send JSON or multipart/form-data (file upload)." },
        { status: 415 }
      );
    }

    const warningsUnique = Array.from(new Set(warnings));

    if (!resumeText || !jobText) {
      return okJson({ ok: false, error: "Missing resumeText (or file/resumeBlobUrl) or jobText" }, { status: 400 });
    }

    if (resumeText.length < 300) {
      return okJson(
        {
          ok: false,
          error: "Resume text too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste text.",
          warnings: warningsUnique,
          debug: {
            parserUsed,
            detectedType,
            pdfInfo,
            blobDebug,
          },
        },
        { status: 400 }
      );
    }

    // ✅ Charge credits AFTER validation
    const COST_ANALYZE = 3;
    const charged = await chargeCredits({
      userId: dbUser.id,
      cost: COST_ANALYZE,
      reason: "analyze",
      eventType: "analyze",
      meta: { cost: COST_ANALYZE },
    });

    if (!charged.ok) {
      return okJson({ ok: false, error: "OUT_OF_CREDITS", balance: charged.balance }, { status: 402 });
    }

    chargedUserId = dbUser.id;
    chargedCost = COST_ANALYZE;

    // --- Do analysis ---
    const analysis: any = analyzeKeywordFit(resumeText, jobText);
    const metaBlocks = extractMetaBlocks(resumeText);

    const highlights = {
      gamesShipped: metaBlocks.gamesShipped,
      keyMetrics: metaBlocks.metrics,
    };

    const experienceSlice = extractExperienceSection(resumeText);
    const bulletSourceText = onlyExperienceBullets ? experienceSlice.experienceText : resumeText;

    let experienceJobs: any[] = [];
    let bullets: string[] = [];
    let bulletJobIds: string[] = [];

    const normalizeJobs = (jobsIn: any[]) =>
      (Array.isArray(jobsIn) ? jobsIn : []).map((j) => ({
        id: String(j?.id ?? "job_default"),
        company: String(j?.company || "Company"),
        title: String(j?.title || "Role"),
        dates: String(j?.dates || "Dates"),
        location: j?.location ? String(j.location) : "",
        bullets: Array.isArray(j?.bullets) ? j.bullets.map((b: any) => String(b || "").trim()).filter(Boolean) : [],
      }));

    const tryExtract = async (text: string) => {
      try {
        const mod: any = await import("@/lib/extractResumeBullets");
        const extractResumeBullets = mod?.extractResumeBullets as undefined | ((t: string) => any);
        if (typeof extractResumeBullets !== "function") return { bullets: [] as string[], jobs: [] as any[] };

        const maybe: any = extractResumeBullets(text);
        if (Array.isArray(maybe)) return { bullets: maybe as string[], jobs: [] as any[] };

        return {
          bullets: Array.isArray(maybe?.bullets) ? (maybe.bullets as string[]) : [],
          jobs: Array.isArray(maybe?.jobs) ? maybe.jobs : [],
        };
      } catch {
        return { bullets: [] as string[], jobs: [] as any[] };
      }
    };

    // Smart-gated DOCX list bullets (kept)
    const seededFileBulletsRaw = filterBadBullets(bulletsFromFile || []);
    let seededFileBullets = seededFileBulletsRaw;

    if (onlyExperienceBullets) {
      const expHaystack = normalizeForContains(experienceSlice.experienceText);
      seededFileBullets = seededFileBullets.filter((b) => {
        const needle = normalizeForContains(b);
        if (!needle) return false;
        return expHaystack.includes(needle);
      });
    }

    // 1) strict on experience slice (existing extractor)
    const strict1 = await tryExtract(experienceSlice.experienceText);
    experienceJobs = normalizeJobs(strict1.jobs);

    // flatten from extracted jobs
    const flat1 = flattenFromJobs(experienceJobs);
    bullets = filterBadBullets(flat1.outBullets);
    bulletJobIds = flat1.outJobIds;

    // 2) fallback to bulletSourceText if no bullets
    if (!bullets.length) {
      const strict2 = await tryExtract(bulletSourceText);

      const jobs2 = normalizeJobs(strict2.jobs);
      const flat2 = flattenFromJobs(jobs2);

      if (flat2.outBullets.length) {
        experienceJobs = jobs2;
        bullets = filterBadBullets(flat2.outBullets);
        bulletJobIds = flat2.outJobIds;
      } else {
        const raw = (strict2.bullets || []).map((b) => String(b || "").trim()).filter(Boolean);
        bullets = filterBadBullets(raw);

        const fallbackJobId = experienceJobs[0]?.id || "job_default";
        bulletJobIds = bullets.map(() => fallbackJobId);
      }
    }

    // ✅ 2.5) LAST RESORT for PDFs: scan for glyph bullets (●) directly from text
    if (!bullets.length) {
      const scanned = scanBulletsFromTextFallback(bulletSourceText);
      if (scanned.length) {
        bullets = scanned;
        const fallbackJobId = experienceJobs[0]?.id || "job_default";
        bulletJobIds = bullets.map(() => fallbackJobId);
      }
    }

    // 3) if still empty, fall back to DOCX list bullets (smart-gated)
    if (!bullets.length && seededFileBullets.length) {
      bullets = seededFileBullets;
      const fallbackJobId = experienceJobs[0]?.id || "job_default";
      bulletJobIds = bullets.map(() => fallbackJobId);
    }

    if (!bullets.length) {
      // refund: parsing failure
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_analyze_no_bullets",
          eventType: "analyze",
          meta: {
            cost: chargedCost,
            foundExperienceSection: experienceSlice.foundSection,
            experienceMode: experienceSlice.mode,
            bulletsFromFileCount: (bulletsFromFile || []).length,
            seededFileBulletsCount: seededFileBullets.length,
            blobDebug,
            parserUsed,
            detectedType,
            warnings: warningsUnique,
            pdfInfo,
          },
        });

        return okJson(
          {
            ok: false,
            error:
              "No bullets detected. Your resume may not use bullet markers (•, -, ●, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
            refunded: true,
            balance: refunded.balance,
            warnings: warningsUnique,
            debug: {
              parserUsed,
              detectedType,
              pdfInfo,
              foundExperienceSection: experienceSlice.foundSection,
              experienceMode: experienceSlice.mode,
              experienceLen: experienceSlice.experienceText.length,
              bulletsFromFileCount: (bulletsFromFile || []).length,
              seededFileBulletsCount: seededFileBullets.length,
              blobDebug,
            },
          },
          { status: 400 }
        );
      } catch (refundErr: any) {
        return okJson(
          {
            ok: false,
            error:
              "No bullets detected. Your resume may not use bullet markers (•, -, ●, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
            warnings: warningsUnique,
          },
          { status: 400 }
        );
      }
    }

    // ✅ if extracted jobs are placeholders, rebuild from experience text for PREVIEW headings
    if (bullets.length && jobsLookPlaceholder(experienceJobs)) {
      const previewJobs = buildExperienceJobsForPreviewFromText(experienceSlice.experienceText || bulletSourceText);
      if (previewJobs.length) {
        experienceJobs = previewJobs;

        // keep bullets mapping when possible
        const flatPreview = flattenFromJobs(experienceJobs);
        const filteredPreviewBullets = filterBadBullets(flatPreview.outBullets);

        if (filteredPreviewBullets.length === flatPreview.outBullets.length) {
          bullets = filteredPreviewBullets;
          bulletJobIds = flatPreview.outJobIds;
        } else {
          const keep = new Set(filteredPreviewBullets.map((b) => normalizeForContains(b)));
          const newIds: string[] = [];
          for (let i = 0; i < flatPreview.outBullets.length; i++) {
            const k = normalizeForContains(flatPreview.outBullets[i]);
            if (keep.has(k)) newIds.push(flatPreview.outJobIds[i]);
          }
          bullets = filteredPreviewBullets;
          bulletJobIds = newIds;
        }
      }
    }

    // Suggestions + plan
    let bulletSuggestions: any[] = [];
    let weakBullets: any[] = [];

    try {
      const bulletObjs = normalizeBulletsForSuggestions({
        bullets,
        bulletJobIds,
        fallbackJobId: experienceJobs[0]?.id || "job_default",
      });

      const suggestionResult: any = suggestKeywordsForBullets(bulletObjs, jobText, analysis.missingKeywords);
      bulletSuggestions = suggestionResult?.bulletSuggestions ?? [];
      weakBullets = suggestionResult?.weakBullets ?? [];
    } catch {
      bulletSuggestions = [];
      weakBullets = [];
    }

    let rewritePlan: any[] = [];
    try {
      rewritePlan = buildRewritePlan(bulletSuggestions);
    } catch {
      rewritePlan = [];
    }

    if (!Array.isArray(rewritePlan) || rewritePlan.length === 0) {
      const seedKeywords = (analysis.highImpactMissing || analysis.missingKeywords || []).slice(0, 5);
      rewritePlan = bullets.map((b) => ({
        originalBullet: b,
        suggestedKeywords: seedKeywords,
        rewrittenBullet: "",
      }));
    }

    rewritePlan = (rewritePlan || []).map((item: any, i: number) => {
      const original =
        typeof item?.originalBullet === "string" ? item.originalBullet : String(item?.originalBullet ?? "");
      const jobId = bulletJobIds[i] || experienceJobs[0]?.id || "job_default";

      return {
        ...item,
        originalBullet: original,
        jobId,
        verbStrength: computeVerbStrength(original, { mode: "before" }),
      };
    });

    return okJson({
      ok: true,
      balance: charged.balance,

      ...analysis,

      experienceJobs,
      bullets,
      bulletJobIds,

      bulletSuggestions,
      weakBullets,
      rewritePlan,
      metaBlocks,

      highlights,

      warnings: warningsUnique,

      debug: {
        contentType,
        resumeLen: resumeText.length,
        jobLen: jobText.length,
        onlyExperienceBulletsUsed: onlyExperienceBullets,
        experienceLen: experienceSlice.experienceText.length,
        foundExperienceSection: experienceSlice.foundSection,
        experienceMode: experienceSlice.mode,
        bulletsFromFileCount: (bulletsFromFile || []).length,
        seededFileBulletsCount: seededFileBullets.length,
        jobsDetected: experienceJobs.length,
        jobsWithBullets: experienceJobs.filter((j) => j.bullets?.length).length,
        flattenedBulletCount: bullets.length,
        rewritePlanCount: Array.isArray(rewritePlan) ? rewritePlan.length : 0,
        metaGamesCount: metaBlocks.gamesShipped.length,
        metaMetricsCount: metaBlocks.metrics.length,
        maxFileMb: MAX_FILE_MB,
        blobDebug,
        jobsWerePlaceholder: jobsLookPlaceholder(normalizeJobs(strict1?.jobs || [])),

        detectedType,
        parserUsed,
        pdfInfo,
      },
    });
  } catch (e: any) {
    const message = e?.message ? String(e.message) : String(e);
    console.error("analyze route error:", e);

    if (chargedUserId && chargedCost > 0) {
      try {
        const refunded = await refundCredits({
          userId: chargedUserId,
          amount: chargedCost,
          reason: "refund_analyze_failed",
          eventType: "analyze",
          meta: { cost: chargedCost, error: message },
        });

        return okJson(
          { ok: false, error: message || "Failed to analyze input", refunded: true, balance: refunded.balance },
          { status: 500 }
        );
      } catch (refundErr: any) {
        return okJson(
          {
            ok: false,
            error: message || "Failed to analyze input",
            refunded: false,
            refundError: refundErr?.message || String(refundErr),
          },
          { status: 500 }
        );
      }
    }

    return okJson({ ok: false, error: message || "Failed to analyze input" }, { status: 500 });
  }
}

export async function GET() {
  return okJson({ ok: false, route: "src/app/api/analyze/route.ts", tag: BOOT_TAG }, { status: 405 });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}