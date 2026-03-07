// src/lib/pdf_quality.ts

export type PdfQuality = {
  ok: boolean;
  score: number; // 0..100
  reasons: string[];
  stats: {
    chars: number;
    lines: number;
    bullets: number;
    hasExperience: boolean;
    hasEducation: boolean;
    hasSkills: boolean;
    weirdCharRatio: number; // 0..1
  };
};

function countMatches(s: string, re: RegExp) {
  const m = String(s || "").match(re);
  return m ? m.length : 0;
}

export function assessPdfTextQuality(textRaw: string): PdfQuality {
  const text = String(textRaw || "");
  const chars = text.length;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  const lower = text.toLowerCase();

  const hasExperience = /\b(experience|work experience|professional experience|employment history)\b/.test(lower);
  const hasEducation = /\beducation\b/.test(lower);
  const hasSkills = /\bskills?\b/.test(lower);

  // Detect bullets in a few common forms (glyph + dash)
  const bullets =
    countMatches(text, /[\u2022•\u25CF]\s+/g) +
    countMatches(text, /^\s*[-•\u2022\u25CF]\s+/gm) +
    countMatches(text, /^\s*\d+\.\s+/gm);

  // crude “weird text” heuristic
  const weirdMatches = countMatches(text, /[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g);
  const weirdCharRatio = chars ? weirdMatches / chars : 1;

  let score = 100;
  const reasons: string[] = [];

  if (chars < 600) {
    score -= 35;
    reasons.push("Very little extracted text (chars < 600).");
  }
  if (lines < 12) {
    score -= 20;
    reasons.push("Very few lines extracted (lines < 12).");
  }
  if (bullets < 4) {
    score -= 15;
    reasons.push("Very few bullet markers detected (bullets < 4).");
  }
  if (!hasExperience) {
    score -= 20;
    reasons.push("Missing Experience heading.");
  }
  if (weirdCharRatio > 0.01) {
    score -= 20;
    reasons.push("High weird-character ratio (text looks corrupted).");
  }

  score = Math.max(0, Math.min(100, score));
  const ok = score >= 65;

  return {
    ok,
    score,
    reasons: ok ? [] : reasons,
    stats: {
      chars,
      lines,
      bullets,
      hasExperience,
      hasEducation,
      hasSkills,
      weirdCharRatio,
    },
  };
}