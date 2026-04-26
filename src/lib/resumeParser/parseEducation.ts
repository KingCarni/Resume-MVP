import type { DetectedResumeSection, ParsedResumeEducation, ParsedResumeEducationEntry } from "./types";

const CREDENTIAL_RE = /\b(?:bachelor|master|associate|diploma|certificate|certification|degree|b\.a\.|b\.s\.|m\.a\.|m\.s\.|mba|phd|ged)\b/i;
const DATE_RE = /\b(?:19|20)\d{2}\b/;

export function parseEducation(sections: DetectedResumeSection[]): ParsedResumeEducation {
  const educationSections = sections.filter((section) => section.kind === "education");
  const rawText = educationSections.map((section) => section.lines.join("\n")).filter(Boolean).join("\n\n").trim();
  const entries: ParsedResumeEducationEntry[] = [];

  let entryBuffer: string[] = [];
  const flush = () => {
    const raw = entryBuffer.join("\n").trim();
    if (!raw) return;
    const lines = entryBuffer.map((line) => line.trim()).filter(Boolean);
    const credentialLine = lines.find((line) => CREDENTIAL_RE.test(line));
    const dateLine = lines.find((line) => DATE_RE.test(line));
    entries.push({
      id: `education_${entries.length + 1}`,
      institution: lines.find((line) => !CREDENTIAL_RE.test(line) && !DATE_RE.test(line)),
      credential: credentialLine,
      endDate: dateLine?.match(DATE_RE)?.[0],
      rawText: raw,
      confidence: credentialLine || lines.length >= 2 ? "probable" : "unlikely",
    });
    entryBuffer = [];
  };

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    entryBuffer.push(trimmed);
  }
  flush();

  return { entries, rawText };
}
