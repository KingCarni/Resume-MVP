// src/lib/bullets.ts

export type ResumeBullet = {
  id: string;
  text: string;
};

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
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
  // Avoid grabbing section headings as bullets
  const l = line.trim();
  if (l.length <= 3) return true;
  if (/^(experience|work experience|skills|summary|education|projects|certifications)\b/i.test(l)) return true;
  // All-caps short lines are often headings
  if (l.length < 40 && l === l.toUpperCase() && /[A-Z]/.test(l)) return true;
  return false;
}

export function extractResumeBullets(resumeText: string): ResumeBullet[] {
  const lines = resumeText
    .replace(/\r\n/g, "\n")
    .split("\n");

  const bullets: string[] = [];
  let current: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  "); // tabs -> spaces
    const trimmed = line.trim();

    if (!trimmed) {
      // blank line ends a bullet continuation
      if (current) {
        const cleaned = normalizeSpaces(current);
        if (cleaned.length >= 12 && !looksLikeHeading(cleaned)) bullets.push(cleaned);
        current = null;
      }
      continue;
    }

    const start = matchBulletStart(trimmed);

    if (start) {
      // flush previous bullet
      if (current) {
        const cleaned = normalizeSpaces(current);
        if (cleaned.length >= 12 && !looksLikeHeading(cleaned)) bullets.push(cleaned);
      }
      current = start;
      continue;
    }

    // Continuation line: if it's indented in the original text, append to current bullet
    const isIndented = /^\s{2,}/.test(line);

    if (current && isIndented) {
      current = `${current} ${trimmed}`;
      continue;
    }

    // If we have a current bullet and this line is NOT indented, it's probably a new paragraph/section
    if (current) {
      const cleaned = normalizeSpaces(current);
      if (cleaned.length >= 12 && !looksLikeHeading(cleaned)) bullets.push(cleaned);
      current = null;
    }

    // Otherwise ignore non-bullet lines for now (MVP)
  }

  // flush last bullet
  if (current) {
    const cleaned = normalizeSpaces(current);
    if (cleaned.length >= 12 && !looksLikeHeading(cleaned)) bullets.push(cleaned);
  }

  // Deduplicate while preserving order
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
