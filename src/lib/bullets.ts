// src/lib/bullets.ts

export type ResumeBullet = {
  id: string;
  text: string;
};

function normalizeSpaces(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

// Detect many common bullet starters (Word/Docs copy-paste included)
function matchBulletStart(line: string): string | null {
  const l = line.trim();

  // 1) Symbol bullets: • ▪ ◦ ‣ · * -
  // Also supports no-space after symbol (e.g., "-Did thing")
  const sym = l.match(/^([•\u2022▪\u25AA◦\u25E6‣\u2023·\u00B7\-\*])\s*(.+)$/);
  if (sym?.[2]) return sym[2].trim();

  // 2) En/em dash bullets: – —
  const dash = l.match(/^[–—]\s*(.+)$/);
  if (dash?.[1]) return dash[1].trim();

  // 3) Numbered bullets: 1. / 2) / 3 -
  const num = l.match(/^\d{1,2}[\.\)\-]\s*(.+)$/);
  if (num?.[1]) return num[1].trim();

  // 4) Letter bullets: a) / b. (less common but easy)
  const alpha = l.match(/^[a-zA-Z][\.\)]\s*(.+)$/);
  if (alpha?.[1]) return alpha[1].trim();

  return null;
}

function looksLikeHeading(line: string) {
  const l = line.trim();
  if (l.length <= 3) return true;
  if (/^(experience|work experience|skills|summary|education|projects|certifications)\b/i.test(l)) {
    return true;
  }
  if (l.length < 40 && l === l.toUpperCase() && /[A-Z]/.test(l)) return true;
  return false;
}

function looksLikeContactOrReferenceLine(s: string) {
  const t = normalizeSpaces(s);

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) return true;

  const digitCount = (t.match(/\d/g) || []).length;
  if (digitCount >= 7) return true;

  if (/\b(references?|reference available|contact|phone|mobile|email|linkedin|github|portfolio)\b/i.test(t)) {
    return true;
  }

  if (/\bhttps?:\/\/\S+|\bwww\.\S+/i.test(t)) return true;

  if (t.length <= 60 && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/.test(t)) return true;

  return false;
}

function shouldKeepBullet(text: string) {
  const cleaned = normalizeSpaces(text);
  if (cleaned.length < 12) return false;
  if (looksLikeHeading(cleaned)) return false;
  if (looksLikeContactOrReferenceLine(cleaned)) return false;
  return true;
}

function looksLikeSectionBoundary(line: string) {
  const t = normalizeSpaces(line);
  if (!t) return true;
  if (looksLikeHeading(t)) return true;

  // Common resume headers / job lines
  if (/^(skills|summary|experience|work experience|education|projects|certifications|areas of expertise|key metrics)\b/i.test(t)) {
    return true;
  }

  // Strong signal for a job header/date row
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/i.test(t)) {
    return true;
  }

  return false;
}

function looksLikeBulletContinuation(line: string) {
  const t = normalizeSpaces(line);
  if (!t) return false;
  if (looksLikeHeading(t)) return false;
  if (looksLikeContactOrReferenceLine(t)) return false;
  if (matchBulletStart(t)) return false;
  if (looksLikeSectionBoundary(t)) return false;

  // Lowercase / punctuation starts are usually wrapped continuation lines from PDFs.
  if (/^[a-z0-9(%$~]/.test(t)) return true;

  // Common continuation starters inside a sentence.
  if (/^(and|or|to|for|with|while|using|via|through|across|including|improving|reducing|increasing|lowering|enhancing|supporting)\b/i.test(t)) {
    return true;
  }

  // Hyphenated wrap fragments like "long - term" or sentence fragments ending previous line.
  if (/^[a-z]+\s*-\s*[a-z]+/i.test(t)) return true;

  return false;
}

export function extractResumeBullets(resumeText: string): ResumeBullet[] {
  const lines = String(resumeText || "")
    .replace(/\r\n/g, "\n")
    .split("\n");

  const bullets: string[] = [];
  let current: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!trimmed) {
      if (current) {
        if (shouldKeepBullet(current)) bullets.push(normalizeSpaces(current));
        current = null;
      }
      continue;
    }

    const start = matchBulletStart(trimmed);
    if (start) {
      if (current) {
        if (shouldKeepBullet(current)) bullets.push(normalizeSpaces(current));
      }
      current = start;
      continue;
    }

    const isIndented = /^\s{2,}/.test(line);

    if (current && (isIndented || looksLikeBulletContinuation(trimmed))) {
      if (!looksLikeContactOrReferenceLine(trimmed)) {
        current = `${current} ${trimmed}`;
      }
      continue;
    }

    if (current) {
      if (shouldKeepBullet(current)) bullets.push(normalizeSpaces(current));
      current = null;
    }
  }

  if (current) {
    if (shouldKeepBullet(current)) bullets.push(normalizeSpaces(current));
  }

  const seen = new Set<string>();
  const out: ResumeBullet[] = [];

  for (const b of bullets) {
    const key = b.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `b${out.length + 1}`, text: b });
  }

  return out.slice(0, 60);
}
