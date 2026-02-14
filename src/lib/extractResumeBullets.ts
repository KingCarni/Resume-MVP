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

function cleanLine(line: string) {
  return (line || "").replace(/\s+/g, " ").trim();
}

/** ---------- “Do not include as bullets” filters ---------- */

function hasEmail(line: string) {
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line);
}

function hasUrl(line: string) {
  return /\bhttps?:\/\/\S+|\bwww\.\S+/i.test(line) || /\blinkedin\.com\/in\/\S+/i.test(line);
}

/**
 * Phone-ish: catches things like
 * 604-555-1234
 * (604) 555 1234
 * 6045551234
 * 5551234
 * +1 604 555 1234
 */
function hasPhone(line: string) {
  const l = line;

  // canonical North American patterns
  if (/\b\d{3}[-.)\s]*\d{3}[-.\s]*\d{4}\b/.test(l)) return true;

  // 7+ digits somewhere (after removing separators)
  const digits = l.replace(/[^\d]/g, "");
  if (digits.length >= 7 && digits.length <= 15) {
    // avoid catching years/date ranges by requiring it not to look like a range
    // e.g. "2019-2022" -> digits length 8 but it's clearly a date range pattern
    if (/\b(19|20)\d{2}\s*[-–—]\s*(19|20)\d{2}\b/.test(l)) return false;
    return true;
  }

  return false;
}

/**
 * Name-only lines can sneak in from headers or reference sections.
 * We keep it conservative:
 * - 2–3 words
 * - each word Capitalized
 * - no punctuation/digits
 */
function looksLikeStandalonePersonName(line: string) {
  const l = cleanLine(line);
  if (!l) return false;
  if (/[0-9@]/.test(l)) return false;
  if (/[,:;()/\\|]/.test(l)) return false;

  const parts = l.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return false;

  // Don’t block common role-like lines (QA Lead, Senior Engineer)
  // These usually include words like Senior/Lead/Manager/Engineer/Analyst, etc.
  if (/\b(qa|quality|engineer|developer|manager|lead|analyst|director|producer|designer|tester)\b/i.test(l))
    return false;

  return parts.every((p) => /^[A-Z][a-z]+$/.test(p));
}

function looksLikeReferenceLine(line: string) {
  const l = cleanLine(line).toLowerCase();
  if (!l) return false;

  if (l === "references" || l === "reference") return true;
  if (l.includes("references available")) return true;
  if (l.includes("available upon request")) return true;

  return false;
}

function looksLikeAddress(line: string) {
  // light heuristic: "123 Main St"
  const l = cleanLine(line);
  return /^\d+\s+\w+/.test(l) && /\b(st|street|ave|avenue|rd|road|blvd|drive|dr|lane|ln|way)\b/i.test(l);
}

/**
 * Single gatekeeper used everywhere right before we accept a line as a bullet.
 */
function rejectAsBullet(line: string) {
  const l = cleanLine(line);
  if (!l) return true;

  if (hasEmail(l)) return true;
  if (hasUrl(l)) return true;
  if (hasPhone(l)) return true;

  if (looksLikeReferenceLine(l)) return true;
  if (looksLikeStandalonePersonName(l)) return true;
  if (looksLikeAddress(l)) return true;

  return false;
}

/** ---------- Bullet + section helpers ---------- */

function looksLikeHeading(line: string) {
  return /^(skills|certificates|certifications|education|projects|references|areas of expertise|summary|technical skills|experience|professional experience)\b/i.test(
    cleanLine(line)
  );
}

/** Accept a bunch of common bullet markers */
function isBulletLine(line: string) {
  return /^(\u2022|•|-|\*|·|o||‣|∙|–)\s+/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^(\u2022|•|-|\*|·|o||‣|∙|–)\s+/, "").trim();
}

/**
 * STRICT job anchor detection:
 * We only start a new job when we see a month+year date range.
 * Example: "Jan 2021 – Present" or "Sept 2020 - Mar 2022"
 */
function isDateRangeLine(line: string) {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const re = new RegExp(
    `\\b${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present|current)\\b`,
    "i"
  );
  return re.test(line);
}

function extractDateRange(line: string) {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const re = new RegExp(
    `(${month}\\s+${year}\\s*[–-]\\s*(${month}\\s+${year}|present|current))`,
    "i"
  );
  const m = line.match(re);
  return m?.[1] ?? "";
}

function uid() {
  return `job_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

/**
 * If the date range is on the same line as other text, use that as header text.
 * Otherwise fall back to prev header lines.
 */
function parseHeader(companyMaybe: string, titleMaybe: string, inlineHeader: string) {
  const header = cleanLine(inlineHeader);

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

  return {
    company: cleanLine(companyMaybe) || "Company",
    title: cleanLine(titleMaybe) || "Role",
  };
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
  if (looksLikeHeading(l)) return false;
  if (isDateRangeLine(l)) return false;

  // reject contact/reference/name/phone/email/links here too
  if (rejectAsBullet(l)) return false;

  // Avoid lines that look like only a label (too short)
  if (l.length < 25) return false;

  // Avoid obvious "company/title" label lines inside job blocks
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

  const pushBullet = (b0: string) => {
    const b = cleanLine(b0);
    if (!b) return;
    if (b.length < 10) return;
    if (rejectAsBullet(b)) return;

    bulletsFlat.push(b);

    if (!current) {
      current = {
        id: "job_default",
        company: "Experience",
        title: "",
        dates: "",
        bullets: [],
      };
    }
    current.bullets.push(b);
  };

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    // Start new job when we hit a date range line
    if (isDateRangeLine(line)) {
      if (current && current.bullets.length) jobs.push(current);

      const dates = extractDateRange(line) || line;
      const inlineHeader = cleanLine(line.replace(dates, ""));

      const parsed = parseHeader(prev2, prev1, inlineHeader);

      current = {
        id: uid(),
        company: parsed.company || "Company",
        title: parsed.title || "Role",
        dates,
        bullets: [],
      };

      prev1 = "";
      prev2 = "";
      continue;
    }

    // Explicit bullets: only push if not rejected
    if (isBulletLine(line)) {
      const b = stripBullet(line);
      pushBullet(b);
      continue;
    }

    // Hybrid inside job: accept bullet-ish sentences too (already rejects contact stuff)
    if (current && isBulletishSentence(line)) {
      pushBullet(line);
      continue;
    }

    // Track as potential header lines (but do NOT allow contact/reference/name lines to poison headers)
    if (!looksLikeHeading(line) && !rejectAsBullet(line)) {
      prev2 = prev1;
      prev1 = line;
    }
  }

  if (current && current.bullets.length) jobs.push(current);

  const dedup = (arr: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of arr.map(cleanLine)) {
      const key = x.toLowerCase();
      if (!x) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(x);
    }
    return out;
  };

  const cleanJobs = jobs.map((j) => ({
    ...j,
    bullets: dedup(j.bullets).slice(0, 60),
  }));

  const cleanFlat = dedup(bulletsFlat).slice(0, 220);

  return { bullets: cleanFlat, jobs: cleanJobs };
}
