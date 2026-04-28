import type { DetectedResumeSection, ResumeFieldConfidence, ResumeSectionKind } from "./types";

const SECTION_ALIASES: Array<{ kind: ResumeSectionKind; aliases: string[] }> = [
  {
    kind: "summary",
    aliases: [
      "profile",
      "summary",
      "professional summary",
      "career summary",
      "objective",
      "profile summary",
      "snapshot",
      "career snapshot",
      "professional snapshot",
      "overview",
      "about",
      "about me",
    ],
  },
  {
    kind: "experience",
    aliases: [
      "experience",
      "job experience",
      "work experience",
      "professional experience",
      "employment history",
      "work history",
      "career history",
      "relevant experience",
      "employment experience",
      "work story",
      "career story",
      "selected work",
      "selected experience",
      "role history",
      "professional background",
      "career highlights",
      "highlights",
    ],
  },
  {
    kind: "education",
    aliases: [
      "education",
      "academic background",
      "education and training",
      "training",
      "learning",
      "academic history",
      "credentials",
    ],
  },
  {
    kind: "skills",
    aliases: [
      "skills",
      "technical skills",
      "core skills",
      "areas of expertise",
      "expertise",
      "key skills",
      "competencies",
      "toolbox",
      "tool box",
      "toolkit",
      "tool kit",
      "tools",
      "technologies",
      "technology",
      "tech stack",
      "technical toolkit",
      "technical toolbox",
    ],
  },
  { kind: "certifications", aliases: ["certifications", "certificates", "licenses", "licences", "certifications and licenses"] },
  { kind: "projects", aliases: ["projects", "selected projects", "professional projects", "portfolio", "project work", "academic projects"] },
  { kind: "interests", aliases: ["interests", "activities", "volunteer", "volunteering", "community"] },
];

const CONTACT_HINT_RE = /(?:@|https?:\/\/|www\.|linkedin\.com|github\.com|\b\d{3}[-.)\s]\d{3})/i;
const NAME_HINT_RE = /^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}(?:,\s*[A-Za-z.]{2,10})?$/;

function isContactLikeLine(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (CONTACT_HINT_RE.test(trimmed)) return true;
  if (NAME_HINT_RE.test(trimmed)) return true;
  if (/^[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){1,3}\s+[A-Z][A-Za-z][A-Za-z /&+-]{2,40}$/.test(trimmed)) return true;
  if (/\b(?:remote|canada|usa|united states)\b/i.test(trimmed) || /,\s*[A-Z]{2}\b/.test(trimmed)) return true;
  return false;
}

function isSummaryLikeLine(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (CONTACT_HINT_RE.test(trimmed)) return false;
  if (trimmed.length >= 60) return true;
  if (/[.!?]/.test(trimmed) && trimmed.length >= 24) return true;
  return false;
}

function normalizeHeading(line: string) {
  return String(line || "")
    .toLowerCase()
    .replace(/[:|]/g, "")
    .replace(/[^a-z0-9 &/+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyHeadingLine(line: string) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (trimmed.startsWith("â€¢ ")) return false;
  if (/\b(19|20)\d{2}\b/.test(trimmed)) return false;
  if (CONTACT_HINT_RE.test(trimmed)) return false;
  return true;
}

export function classifySectionHeading(line: string): { kind: ResumeSectionKind; confidence: ResumeFieldConfidence } | null {
  if (!isLikelyHeadingLine(line)) return null;
  const normalized = normalizeHeading(line);
  if (!normalized) return null;

  for (const group of SECTION_ALIASES) {
    for (const alias of group.aliases) {
      if (normalized === alias) return { kind: group.kind, confidence: "confident" };
    }
  }

  for (const group of SECTION_ALIASES) {
    for (const alias of group.aliases) {
      if (normalized.includes(alias) && normalized.length <= alias.length + 18) {
        return { kind: group.kind, confidence: "probable" };
      }
      if (normalized.startsWith(`${alias} `) && /^[A-Z][A-Z &/+-]{2,40}\b/.test(String(line || "").trim())) {
        return { kind: group.kind, confidence: "probable" };
      }
    }
  }

  return null;
}

export function detectResumeSections(lines: string[]): DetectedResumeSection[] {
  const headings: Array<{ line: string; index: number; kind: ResumeSectionKind; confidence: ResumeFieldConfidence }> = [];

  lines.forEach((line, index) => {
    const detected = classifySectionHeading(line);
    if (detected) {
      const priorHeading = headings[headings.length - 1];
      if (priorHeading && priorHeading.index === index) return;
      headings.push({ line, index, kind: detected.kind, confidence: detected.confidence });
    }
  });

  if (!headings.length) {
    return [
      {
        kind: "unknown",
        heading: "Full Resume",
        startLine: 0,
        endLine: Math.max(0, lines.length - 1),
        lines,
        confidence: "unlikely",
      },
    ];
  }

  const sections: DetectedResumeSection[] = [];

  if (headings[0].index > 0) {
    const preambleLines = lines.slice(0, headings[0].index);
    const summaryStart = preambleLines.findIndex((line, index) => index > 0 && isSummaryLikeLine(line) && !isContactLikeLine(line));

    if (summaryStart > 0) {
      sections.push({
        kind: "contact",
        heading: "Contact",
        startLine: 0,
        endLine: summaryStart - 1,
        lines: preambleLines.slice(0, summaryStart),
        confidence: "probable",
      });
      sections.push({
        kind: "summary",
        heading: "Summary",
        startLine: summaryStart,
        endLine: headings[0].index - 1,
        lines: preambleLines.slice(summaryStart),
        confidence: "probable",
      });
    } else {
      sections.push({
        kind: "contact",
        heading: "Contact",
        startLine: 0,
        endLine: headings[0].index - 1,
        lines: preambleLines,
        confidence: "probable",
      });
    }
  }

  headings.forEach((heading, idx) => {
    const nextHeading = headings[idx + 1];
    const startLine = heading.index;
    const endLine = nextHeading ? nextHeading.index - 1 : lines.length - 1;
    sections.push({
      kind: heading.kind,
      heading: heading.line,
      startLine,
      endLine,
      lines: lines.slice(startLine + 1, endLine + 1),
      confidence: heading.confidence,
    });
  });

  return sections;
}

export function getFirstSectionText(sections: DetectedResumeSection[], kind: ResumeSectionKind) {
  const section = sections.find((item) => item.kind === kind);
  return section ? section.lines.join("\n").trim() : "";
}

export function getSectionTexts(sections: DetectedResumeSection[], kind: ResumeSectionKind) {
  return sections.filter((item) => item.kind === kind).map((section) => section.lines.join("\n").trim()).filter(Boolean);
}
