// src/lib/extractResumeBullets.ts

export type ExtractedJob = {
  id: string;
  company: string;
  title: string;
  dates: string;
  location?: string;
  bullets: string[];
};

function normalizeLines(text: string) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Accept a bunch of common bullet markers */
function isBulletLine(line: string) {
  return /^(\u2022|•|-|\*|·|o||‣|∙|–)\s+/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^(\u2022|•|-|\*|·|o||‣|∙|–)\s+/, "").trim();
}

/**
 * STRICT job anchor detection (same as before):
 * We only start a new job when we see a month+year date range.
 * Example: "Jan 2021 – Present" or "Sept 2020 - Mar 2022"
 */
function isDateRangeLine(line: string) {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const re = new RegExp(
    `\\b${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present)\\b`,
    "i"
  );
  return re.test(line);
}

function extractDateRange(line: string) {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const re = new RegExp(
    `(${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present))`,
    "i"
  );
  const m = line.match(re);
  return m?.[1] ?? "";
}

function uid() {
  return `job_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function cleanLine(line: string) {
  return (line || "").replace(/\s+/g, " ").trim();
}

/**
 * If the date range is on the same line as other text, use that as header text.
 * Otherwise fall back to prev header lines.
 */
function parseHeader(companyMaybe: string, titleMaybe: string, inlineHeader: string) {
  const header = cleanLine(inlineHeader);

  // If we have inline header, try split it into company/title
  // Examples:
  // "Prodigy Education — QA Lead"
  // "QA Lead, Prodigy Education"
  // "Prodigy Education | QA Lead"
  if (header) {
    const sep = /(\s+—\s+|\s+-\s+|\s+\|\s+| · | • )/;
    let parts = header.split(sep).map(cleanLine).filter(Boolean);
    parts = parts.filter((p) => !/^—$|^-$|^\|$|^·$|^•$/.test(p));

    if (parts.length >= 2) {
      return { company: parts[0] || "Company", title: parts[1] || "Role" };
    }

    const commaParts = header.split(",").map(cleanLine).filter(Boolean);
    if (commaParts.length >= 2) {
      return { company: commaParts[1] || "Company", title: commaParts[0] || "Role" };
    }
  }

  // Fallback: previous 2 lines
  return {
    company: cleanLine(companyMaybe) || "Company",
    title: cleanLine(titleMaybe) || "Role",
  };
}

function looksLikeContactOrLink(line: string) {
  const l = cleanLine(line);
  const contactPrefixRegex = /^(p:|e:|l:)\s*/i;
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRegex = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
  const linkedinRegex = /\blinkedin\.com\/in\/\S+/i;
  const phoneRegex = /\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/;

  if (contactPrefixRegex.test(l)) return true;
  if (linkedinRegex.test(l)) return true;
  if (emailRegex.test(l) && l.length < 180) return true;
  if (phoneRegex.test(l) && l.length < 180) return true;
  if (urlRegex.test(l) && l.length < 180) return true;

  return false;
}

function looksLikeHeading(line: string) {
  return /^(skills|certificates|certifications|education|projects|references|areas of expertise|summary|technical skills|experience|professional experience)\b/i.test(
    cleanLine(line)
  );
}

/**
 * Hybrid “bullet-ish” line:
 * - long enough to be meaningful
 * - not contact/link
 * - not a heading
 * - not another date range
 */
function isBulletishSentence(line: string) {
  const l = cleanLine(line);
  if (!l) return false;
  if (looksLikeContactOrLink(l)) return false;
  if (looksLikeHeading(l)) return false;
  if (isDateRangeLine(l)) return false;

  // Avoid lines that look like only a label (too short)
  if (l.length < 25) return false;

  // Avoid obvious "company/title" label lines inside job blocks
  // (common in PDFs where header splits weirdly)
  if (/^(company|role|title|location|dates)\s*:/i.test(l)) return false;

  return true;
}

export function extractResumeBullets(resumeText: string): {
  bullets: string[];
  jobs: ExtractedJob[];
} {
  const lines = normalizeLines(resumeText);

  const bulletsFlat: string[] = [];
  const jobs: ExtractedJob[] = [];

  let current: ExtractedJob | null = null;

  // Track last two non-bullet lines so we can use them as company/title
  let prev1 = "";
  let prev2 = "";

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    // Start new job when we hit a date range line
    if (isDateRangeLine(line)) {
      // finalize previous (keep even if no bullets? we’ll keep it only if bullets exist)
      if (current && current.bullets.length) jobs.push(current);

      const dates = extractDateRange(line) || line;

      // If date range line has other text, treat remainder as header candidate
      const inlineHeader = cleanLine(line.replace(dates, ""));

      const parsed = parseHeader(prev2, prev1, inlineHeader);

      current = {
        id: uid(),
        company: parsed.company || "Company",
        title: parsed.title || "Role",
        dates,
        bullets: [],
      };

      // reset prev buffers after consuming them as header context
      prev1 = "";
      prev2 = "";
      continue;
    }

    // If explicit bullet markers exist, always take them
    if (isBulletLine(line)) {
      const b = stripBullet(line);
      if (b.length >= 10) {
        bulletsFlat.push(b);
        if (!current) {
          // If bullets appear before any job anchor, store under placeholder job
          current = {
            id: "job_default",
            company: "Experience",
            title: "",
            dates: "",
            bullets: [],
          };
        }
        current.bullets.push(b);
      }
      continue;
    }

    // HYBRID: if we're inside a job, accept bullet-ish sentences too
    if (current && isBulletishSentence(line)) {
      const b = line;
      bulletsFlat.push(b);
      current.bullets.push(b);
      continue;
    }

    // Otherwise, track as potential header lines
    // (but ignore headings/contact lines so they don't poison company/title)
    if (!looksLikeHeading(line) && !looksLikeContactOrLink(line)) {
      prev2 = prev1;
      prev1 = line;
    }
  }

  if (current && current.bullets.length) jobs.push(current);

  // De-dupe bullets (PDF extraction can repeat lines)
  const dedup = (arr: string[]) => Array.from(new Set(arr.map(cleanLine))).filter(Boolean);

  const cleanJobs = jobs.map((j) => ({
    ...j,
    bullets: dedup(j.bullets).slice(0, 60),
  }));

  const cleanFlat = dedup(bulletsFlat).slice(0, 220);

  return { bullets: cleanFlat, jobs: cleanJobs };
}
