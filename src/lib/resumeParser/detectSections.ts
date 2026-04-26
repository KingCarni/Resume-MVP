import type { DetectedResumeSection, ResumeFieldConfidence, ResumeSectionKind } from "./types";

const SECTION_ALIASES: Array<{ kind: ResumeSectionKind; aliases: string[] }> = [
  { kind: "summary", aliases: ["profile", "summary", "professional summary", "career summary", "objective", "profile summary"] },
  {
    kind: "experience",
    aliases: [
      "experience",
      "work experience",
      "professional experience",
      "employment history",
      "work history",
      "career history",
      "relevant experience",
      "employment experience",
    ],
  },
  { kind: "education", aliases: ["education", "academic background", "education and training", "training"] },
  {
    kind: "skills",
    aliases: ["skills", "technical skills", "core skills", "areas of expertise", "expertise", "key skills", "competencies"],
  },
  { kind: "certifications", aliases: ["certifications", "certificates", "licenses", "licences", "certifications and licenses"] },
  { kind: "projects", aliases: ["projects", "selected projects", "professional projects", "portfolio"] },
  { kind: "interests", aliases: ["interests", "activities", "volunteer", "volunteering", "community"] },
];

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
  if (!trimmed || trimmed.length > 70) return false;
  if (trimmed.startsWith("â€¢ ")) return false;
  if (/\b(19|20)\d{2}\b/.test(trimmed)) return false;
  if (/@/.test(trimmed)) return false;
  if (/\d{3}[-.)\s]\d{3}/.test(trimmed)) return false;
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
      if (normalized.includes(alias) && normalized.length <= alias.length + 16) {
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
    sections.push({
      kind: "contact",
      heading: "Contact",
      startLine: 0,
      endLine: headings[0].index - 1,
      lines: lines.slice(0, headings[0].index),
      confidence: "probable",
    });
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
