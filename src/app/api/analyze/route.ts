// src/app/api/analyze/route.ts
import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/extractResumeBullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";
import { computeVerbStrength } from "@/lib/verb_strength";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * ✅ Local compat type: the /lib/bullet_suggestions module expects ResumeBullet[]
 * but our extraction pipeline produces string[].
 */
type ResumeBullet = {
  id: string;
  text: string;
  jobId?: string;
};

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
  // PDF: %PDF-
  if (buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-") return "pdf";

  // ZIP/DOCX: PK..
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "docx";

  // DOC (OLE2): D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";

  // Heuristic text: mostly printable in first chunk
  const head = buf.slice(0, Math.min(buf.length, 4096));
  if (head.length) {
    let printable = 0;
    for (const b of head) {
      // allow tab/newline/carriage return + common ASCII printable range
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

function extractLiText(html: string): string[] {
  const matches = [...String(html ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  const bullets = matches
    .map((m) => stripTagsToText(m[1]))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(bullets));
}

/**
 * Extract DOCX in a bullet-aware way:
 * - Convert to HTML (keeps lists)
 * - Pull <li> items as bullets
 * - Also provide a plain-text version that includes "- " lines so downstream parsers work
 */
async function extractDocxTextAndBulletsFromBuffer(buffer: Buffer): Promise<{
  text: string;
  bullets: string[];
  html: string;
}> {
  // Guard: ensure it's actually ZIP/DOCX
  const sniffed = sniffBufferType(buffer);
  if (sniffed !== "docx") {
    if (sniffed === "doc") throw new Error(friendlyUnsupportedDocMsg());
    throw new Error(
      `File is not a valid .docx (zip). Detected: ${sniffed}. Please upload a real DOCX or PDF.`
    );
  }

  const { value: html } = await mammoth.convertToHtml({ buffer });
  const bullets = extractLiText(html);

  const text = stripTagsToText(html);

  const textWithBullets =
    bullets.length > 0 ? `${text}\n\n${bullets.map((b) => `- ${b}`).join("\n")}` : text;

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

    const experienceText =
      typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

    return {
      experienceText: normalizeResumeText(experienceText),
      foundSection: true,
      mode: `heading:${bestNeedle}`,
    };
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

  if (startLine === -1) {
    return { experienceText: text, foundSection: false, mode: "none" };
  }

  const afterStart = lines.slice(startLine).join("\n");
  const endMatch = afterStart.match(endHeadingRegex);
  const endIdx = endMatch?.index;

  const experienceText =
    typeof endIdx === "number" && endIdx > 0 ? afterStart.slice(0, endIdx) : afterStart;

  return {
    experienceText: normalizeResumeText(experienceText),
    foundSection: true,
    mode: "heuristic",
  };
}

/** Option B: capture metadata blocks (not bullets) */
function extractMetaBlocks(fullText: string) {
  const text = normalizeResumeText(fullText);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const gamesShippedRegex = /^(\u{1F3AE}\s*)?games shipped:/iu;
  const metricLikeRegex =
    /(%|\$\s?\d|\b\d+(\.\d+)?\s?(ms|s|sec|secs|minutes|min|hrs|hours|days|weeks)\b|\b\d+(\.\d+)?x\b)/i;

  const gamesShipped: string[] = [];
  const metrics: string[] = [];

  for (const l0 of lines) {
    const l = l0.replace(/\s+/g, " ").trim();
    if (!l) continue;

    if (gamesShippedRegex.test(l)) {
      gamesShipped.push(l);
      continue;
    }

    if (l.length <= 110 && metricLikeRegex.test(l)) {
      if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(19|20)\d{2}\b/i.test(l))
        continue;
      if (/\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/.test(l)) continue;

      metrics.push(l);
      continue;
    }
  }

  return {
    gamesShipped: Array.from(new Set(gamesShipped)).slice(0, 30),
    metrics: Array.from(new Set(metrics)).slice(0, 50),
  };
}

/** ---------------- File extraction ---------------- */

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = "";

  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  let text = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = (content.items || [])
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean);

    text += strings.join(" ") + "\n";
  }

  return text;
}

/**
 * Return BOTH resumeText and any bullets we can confidently extract at file-read time.
 * ✅ Uses magic-byte sniffing so DOC won't crash mammoth/jszip.
 */
async function extractResumeFromFile(file: File): Promise<{
  text: string;
  bulletsFromFile?: string[];
}> {
  const buffer = Buffer.from(await file.arrayBuffer());

  const sniffed = sniffBufferType(buffer);

  if (sniffed === "pdf") {
    const text = await extractTextFromPdfBuffer(buffer);
    return { text, bulletsFromFile: undefined };
  }

  if (sniffed === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets };
  }

  if (sniffed === "doc") {
    throw new Error(friendlyUnsupportedDocMsg());
  }

  if (sniffed === "txt") {
    return { text: buffer.toString("utf8"), bulletsFromFile: undefined };
  }

  // last-resort: filename fallback (but keep it safe)
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
  if (c.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
    return "docx";
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
    const res = await fetch(url, { headers, cache: "no-store" });
    return res;
  };

  let res = await tryFetch(false);

  if (!res.ok && (res.status === 401 || res.status === 403)) {
    res = await tryFetch(true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch resumeBlobUrl. Status ${res.status}. ${text ? `Body: ${text}` : ""}`
    );
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
}> {
  const { buffer, contentType } = await fetchBlobAsBuffer(resumeBlobUrl);

  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new Error(
      `File too large. Max size is ${MAX_FILE_MB}MB. Uploaded file is ${(
        buffer.byteLength /
        (1024 * 1024)
      ).toFixed(2)}MB.`
    );
  }

  // ✅ Prefer magic-byte sniffing over headers/extension (those lie all the time)
  const sniffed = sniffBufferType(buffer);
  const typeFromCt = inferTypeFromContentType(contentType);
  const typeFromUrl = inferExtFromUrl(resumeBlobUrl);

  const detectedType = sniffed !== "unknown" ? sniffed : typeFromCt || typeFromUrl || "unknown";

  if (detectedType === "docx") {
    const { text, bullets } = await extractDocxTextAndBulletsFromBuffer(buffer);
    return { text, bulletsFromFile: bullets, sizeBytes: buffer.byteLength, detectedType };
  }

  if (detectedType === "pdf") {
    const text = await extractTextFromPdfBuffer(buffer);
    return { text, bulletsFromFile: undefined, sizeBytes: buffer.byteLength, detectedType };
  }

  if (detectedType === "doc") {
    throw new Error(
      friendlyUnsupportedDocMsg(
        `(Detected content-type "${contentType || "unknown"}", url "${resumeBlobUrl}")`
      )
    );
  }

  if (detectedType === "txt") {
    return {
      text: buffer.toString("utf8"),
      bulletsFromFile: undefined,
      sizeBytes: buffer.byteLength,
      detectedType,
    };
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

/**
 * ✅ Convert extracted string bullets (+ optional jobId mapping) into ResumeBullet[]
 */
function normalizeBulletsForSuggestions(args: {
  bullets: string[];
  bulletJobIds?: string[];
  fallbackJobId?: string;
}) {
  const { bullets, bulletJobIds, fallbackJobId } = args;

  return (bullets || [])
    .map((t0, i) => {
      const text = String(t0 || "").trim();
      if (!text) return null;

      const jobId = bulletJobIds?.[i] || fallbackJobId || "job_default";

      const b: ResumeBullet = {
        id: `b${i + 1}`,
        text,
        jobId,
      };
      return b;
    })
    .filter((x): x is ResumeBullet => Boolean(x));
}

/** --------- Route --------- */

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let resumeText = "";
    let jobText = "";
    let onlyExperienceBullets: boolean = true;

    // file-level bullets (DOCX <li> extraction)
    let bulletsFromFile: string[] = [];

    // optional debug about blob fetch
    let blobDebug: any = null;

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
          return NextResponse.json(
            {
              ok: false,
              error: `File too large. Max size is ${MAX_FILE_MB}MB. Tip: export an optimized PDF or upload DOCX.`,
            },
            { status: 400 }
          );
        }

        const extracted = await extractResumeFromFile(file);
        resumeText = normalizeResumeText(extracted.text);
        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];
      } else {
        resumeText = normalizeResumeText(resumeTextFallback);
      }
    } else if (contentType.includes("application/json")) {
      const body = await req.json();

      const resumeBlobUrl = String(body.resumeBlobUrl ?? "").trim();

      jobText = normalizeJobText(body.jobText ?? body.jobPostingText);

      if (typeof body.onlyExperienceBullets === "boolean") {
        onlyExperienceBullets = body.onlyExperienceBullets;
      }

      if (resumeBlobUrl) {
        const extracted = await extractResumeFromUrl(resumeBlobUrl);
        resumeText = normalizeResumeText(extracted.text);

        bulletsFromFile = Array.isArray(extracted.bulletsFromFile)
          ? extracted.bulletsFromFile.map((b) => String(b || "").trim()).filter(Boolean)
          : [];

        blobDebug = {
          usedBlobUrl: true,
          detectedType: extracted.detectedType,
          sizeBytes: extracted.sizeBytes,
          url: resumeBlobUrl,
        };

        const extra = normalizeResumeText(body.resumeText);
        if (extra && extra.length >= 200 && extra !== resumeText) {
          resumeText = `${resumeText}\n\n${extra}`;
          blobDebug.appendedResumeText = true;
        }
      } else {
        resumeText = normalizeResumeText(body.resumeText);
      }
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: "Unsupported content type. Send JSON or multipart/form-data (file upload).",
        },
        { status: 415 }
      );
    }

    if (!resumeText || !jobText) {
      return NextResponse.json(
        { ok: false, error: "Missing resumeText (or file/resumeBlobUrl) or jobText" },
        { status: 400 }
      );
    }

    if (resumeText.length < 300) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Resume text too short. If you uploaded a PDF, it may be scanned. Try DOCX or paste text.",
        },
        { status: 400 }
      );
    }

    const analysis: any = analyzeKeywordFit(resumeText, jobText);
    const metaBlocks = extractMetaBlocks(resumeText);

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
        bullets: Array.isArray(j?.bullets)
          ? j.bullets.map((b: any) => String(b || "").trim()).filter(Boolean)
          : [],
      }));

    const flattenFromJobs = (jobsIn: any[]) => {
      const outBullets: string[] = [];
      const outJobIds: string[] = [];
      for (const job of jobsIn) {
        for (const b of job.bullets || []) {
          const t = String(b || "").trim();
          if (!t) continue;
          outBullets.push(t);
          outJobIds.push(job.id);
        }
      }
      return { outBullets, outJobIds };
    };

    const tryExtract = (text: string) => {
      try {
        const maybe: any = extractResumeBullets(text);
        if (Array.isArray(maybe)) {
          return { bullets: maybe as string[], jobs: [] as any[] };
        }
        return {
          bullets: Array.isArray(maybe?.bullets) ? (maybe.bullets as string[]) : [],
          jobs: Array.isArray(maybe?.jobs) ? maybe.jobs : [],
        };
      } catch {
        return { bullets: [] as string[], jobs: [] as any[] };
      }
    };

    /**
     * ✅ Smart DOCX <li> fallback:
     * - always strip contact/reference bullets
     * - if onlyExperienceBullets is true, only keep <li> bullets that appear inside the experience slice
     */
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

    // 1) strict on experience slice
    const strict1 = tryExtract(experienceSlice.experienceText);
    experienceJobs = normalizeJobs(strict1.jobs);
    const flat1 = flattenFromJobs(experienceJobs);
    bullets = filterBadBullets(flat1.outBullets);
    bulletJobIds = flat1.outJobIds;

    // Keep mapping aligned if we filtered
    if (bullets.length !== flat1.outBullets.length) {
      const keep = new Set(bullets.map((b) => normalizeForContains(b)));
      const newIds: string[] = [];
      for (let i = 0; i < flat1.outBullets.length; i++) {
        const t = normalizeForContains(flat1.outBullets[i]);
        if (keep.has(t)) newIds.push(flat1.outJobIds[i]);
      }
      bulletJobIds = newIds;
    }

    // 2) if no bullets, try bulletSourceText
    if (!bullets.length) {
      const strict2 = tryExtract(bulletSourceText);

      const jobs2 = normalizeJobs(strict2.jobs);
      const flat2 = flattenFromJobs(jobs2);

      if (flat2.outBullets.length) {
        experienceJobs = jobs2;

        const filtered = filterBadBullets(flat2.outBullets);
        bullets = filtered;

        if (filtered.length !== flat2.outBullets.length) {
          const keep = new Set(filtered.map((b) => normalizeForContains(b)));
          const newIds: string[] = [];
          for (let i = 0; i < flat2.outBullets.length; i++) {
            const t = normalizeForContains(flat2.outBullets[i]);
            if (keep.has(t)) newIds.push(flat2.outJobIds[i]);
          }
          bulletJobIds = newIds;
        } else {
          bulletJobIds = flat2.outJobIds;
        }
      } else {
        const raw = (strict2.bullets || [])
          .map((b) => String(b || "").trim())
          .filter(Boolean);

        const filtered = filterBadBullets(raw);
        bullets = filtered;

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
      return NextResponse.json(
        {
          ok: false,
          error:
            "No bullets detected. Your resume may not use bullet markers (•, -, etc.) or the experience section could not be parsed. Try uploading DOCX, or paste the resume with bullet characters.",
          debug: {
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

      const suggestionResult: any = suggestKeywordsForBullets(
        bulletObjs,
        jobText,
        analysis.missingKeywords
      );

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

    // Attach jobId + verb strength (before) onto each plan item.
    rewritePlan = (rewritePlan || []).map((item: any, i: number) => {
      const original =
        typeof item?.originalBullet === "string"
          ? item.originalBullet
          : String(item?.originalBullet ?? "");

      const jobId = bulletJobIds[i] || experienceJobs[0]?.id || "job_default";

      return {
        ...item,
        originalBullet: original,
        jobId,
        verbStrength: computeVerbStrength(original, { mode: "before" }),
      };
    });

    return NextResponse.json({
      ok: true,
      ...analysis,

      experienceJobs,
      bullets,
      bulletJobIds,

      bulletSuggestions,
      weakBullets,
      rewritePlan,
      metaBlocks,

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
      },
    });
  } catch (e: any) {
    console.error("analyze route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to analyze input" },
      { status: 500 }
    );
  }
}
