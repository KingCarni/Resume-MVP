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

function digitsCount(s: string) {
  const m = String(s || "").match(/\d/g);
  return m ? m.length : 0;
}

/**
 * Hard filters: lines that should NEVER become experience bullets
 * (contact info, references, names, emails, phone numbers, addresses, etc.)
 */
function isDefinitelyNotExperienceBullet(line: string) {
  const l = cleanLine(line);
  if (!l) return true;

  // Emails
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(l)) return true;

  // URLs / LinkedIn
  if (/\bhttps?:\/\/\S+|\bwww\.\S+/i.test(l)) return true;
  if (/\blinkedin\.com\/in\/\S+/i.test(l)) return true;

  // Phone numbers: count digits (catches "(604)721-9916", "6047219916", "604-721-9916", etc.)
  if (digitsCount(l) >= 7) return true;

  // Addresses: starts with street number + word, OR contains common postal code patterns (Canada/US)
  if (/^\d+\s+\w+/.test(l)) return true;
  if (/\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/i.test(l))
    return true; // Canadian postal code like V3T 0B4
  if (/\b\d{5}(-\d{4})?\b/.test(l)) return true; // US ZIP

  // Reference section markers
  if (/^references?$/i.test(l)) return true;
  if (/^available\s+upon\s+request\.?$/i.test(l)) return true;

  // Likely personal names (First Last) - common in references
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(l)) return true;

  // "Label: value" contact-y lines
  if (/^(p:|e:|l:|phone:|email:|linkedin:)\s*/i.test(l)) return true;

  return false;
}

/** Section heading detection */
function isExperienceStartHeading(line: string) {
  const l = cleanLine(line).toLowerCase();
  return (
    l === "experience" ||
    l === "work experience" ||
    l === "professional experience" ||
    l === "employment history" ||
    l.includes("employment history") ||
    l.includes("work experience") ||
    l.includes("professional experience")
  );
}

function isExperienceEndHeading(line: string) {
  const l = cleanLine(line).toLowerCase();
  // Add to this list as you discover edge cases
  return (
    l === "skills" ||
    l === "personal skills" ||
    l === "technical skills" ||
    l === "education" ||
    l === "certificates" ||
    l === "certifications" ||
    l === "certificates and training" ||
    l === "training" ||
    l === "projects" ||
    l === "achievements" ||
    l === "references" ||
    l.includes("certificat") ||
    l.includes("reference") ||
    l.includes("education") ||
    l.includes("skills") ||
    l.includes("achievements")
  );
}

/** Accept a bunch of common bullet markers */
function isBulletLine(line: string) {
  return /^(\u2022|•|-|\*|·|o||‣|∙|–|—)\s+/.test(line);
}

function stripBullet(line: string) {
  return line.replace(/^(\u2022|•|-|\*|·|o||‣|∙|–|—)\s+/, "").trim();
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
    `\\b${month}\\s+${year}\\s*[–—-]\\s*(${month}\\s+${year}|present|current)\\b`,
    "i"
  );
  return re.test(line);
}

function extractDateRange(line: string) {
  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)";
  const year = "(19|20)\\d{2}";
  const re = new RegExp(
    `(${month}\\s+${year}\\s*[–—-]\\s*(${month}\\s+${year}|present|current))`,
    "i"
  );
  const m = cleanLine(line).match(re);
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

function looksLikeContactOrLink(line: string) {
  const l = cleanLine(line);

  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const urlRegex = /\bhttps?:\/\/\S+|\bwww\.\S+/i;
  const linkedinRegex = /\blinkedin\.com\/in\/\S+/i;

  if (/^(p:|e:|l:|phone:|email:|linkedin:)\s*/i.test(l)) return true;
  if (linkedinRegex.test(l)) return true;
  if (emailRegex.test(l) && l.length < 220) return true;
  if (urlRegex.test(l) && l.length < 220) return true;

  // phone-ish: digits >= 7 catches resume headers and reference numbers
  if (digitsCount(l) >= 7 && l.length < 220) return true;

  return false;
}

function looksLikeHeading(line: string) {
  const l = cleanLine(line);
  if (!l) return false;
  if (isExperienceStartHeading(l)) return true;
  if (isExperienceEndHeading(l)) return true;

  return /^(areas of expertise|summary|technical skills)\b/i.test(l);
}

/**
 * Hybrid “bullet-ish” line:
 * - long enough to be meaningful
 * - not contact/link
 * - not a heading
 * - not another date range
 * - not a definitely-not-bullet
 */
function isBulletishSentence(line: string) {
  const l = cleanLine(line);
  if (!l) return false;

  if (looksLikeContactOrLink(l)) return false;
  if (looksLikeHeading(l)) return false;
  if (isDateRangeLine(l)) return false;
  if (isDefinitelyNotExperienceBullet(l)) return false;

  // Avoid lines that look like only a label (too short)
  if (l.length < 25) return false;

  // Avoid obvious label lines inside job blocks
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

  // ✅ NEW: only capture bullets while inside the Experience/Employment section
  let inExperience = false;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    // Section tracking
    if (isExperienceStartHeading(line)) {
      inExperience = true;
      // don’t let headings poison header buffers
      prev1 = "";
      prev2 = "";
      continue;
    }

    if (isExperienceEndHeading(line)) {
      // finalize and STOP capturing bullets beyond experience
      if (current && current.bullets.length) jobs.push(current);
      current = null;
      inExperience = false;
      prev1 = "";
      prev2 = "";
      continue;
    }

    // If we're not in experience and not currently in a job block, ignore everything
    // (prevents PERSONAL SKILLS / REFERENCES bullets from being captured)
    if (!inExperience && !current) {
      continue;
    }

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

    // Explicit bullet markers
    if (isBulletLine(line)) {
      const b = stripBullet(line);
      if (b.length >= 10 && !looksLikeHeading(b) && !looksLikeContactOrLink(b) && !isDefinitelyNotExperienceBullet(b)) {
        bulletsFlat.push(b);

        // ✅ only create job_default if we're in experience
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
      }
      continue;
    }

    // Hybrid: if we're inside a job, accept bullet-ish sentences too
    if (current && isBulletishSentence(line)) {
      bulletsFlat.push(line);
      current.bullets.push(line);
      continue;
    }

    // Track as potential header lines (but don't let contact/headings poison it)
    if (!looksLikeHeading(line) && !looksLikeContactOrLink(line) && !isDefinitelyNotExperienceBullet(line)) {
      prev2 = prev1;
      prev1 = line;
    }
  }

  if (current && current.bullets.length) jobs.push(current);

  // De-dupe bullets (PDF extraction can repeat lines)
  const dedup = (arr: string[]) => Array.from(new Set(arr.map(cleanLine))).filter(Boolean);

  const cleanJobs = jobs.map((j) => ({
    ...j,
    bullets: dedup(j.bullets)
      .filter((b) => !isDefinitelyNotExperienceBullet(b) && !looksLikeContactOrLink(b) && !looksLikeHeading(b))
      .slice(0, 60),
  }));

  const cleanFlat = dedup(bulletsFlat)
    .filter((b) => !isDefinitelyNotExperienceBullet(b) && !looksLikeContactOrLink(b) && !looksLikeHeading(b))
    .slice(0, 220);

  return { bullets: cleanFlat, jobs: cleanJobs };
}
