import { toResumeParserCompatibilityOutput } from "./compat";
import { detectResumeSections, getFirstSectionText } from "./detectSections";
import { normalizeResumeTextForParsing } from "./normalizeText";
import { parseContact } from "./parseContact";
import { parseEducation } from "./parseEducation";
import { parseExperience } from "./parseExperience";
import { parseSkills } from "./parseSkills";
import { buildParserWarnings, buildQualityMetrics, scoreParseConfidence } from "./scoreParseQuality";
import type { ParsedResumeDocument, ResumeParserCompatibilityOutput, ResumeParserMetadataInput } from "./types";

export * from "./types";
export { toResumeParserCompatibilityOutput } from "./compat";
export { normalizeResumeTextForParsing } from "./normalizeText";
export { detectResumeSections } from "./detectSections";
export { parseExperience } from "./parseExperience";

function createStableSourceHash(text: string) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return `resume_${(hash >>> 0).toString(16)}`;
}

function buildSummary(rawText: string) {
  const clean = String(rawText || "").trim();
  return {
    rawText: clean,
    confidence: clean.length >= 60 ? "probable" as const : clean.length ? "unlikely" as const : "very_unlikely" as const,
  };
}

export function parseResumeDocument(rawText: unknown, metadata: ResumeParserMetadataInput = {}): ParsedResumeDocument {
  const normalized = normalizeResumeTextForParsing(rawText);
  const sections = detectResumeSections(normalized.lines);
  const contact = parseContact(sections, normalized.lines);
  const experience = parseExperience(sections);
  const education = parseEducation(sections);
  const skills = parseSkills(sections);
  const summary = buildSummary(getFirstSectionText(sections, "summary"));

  const preWarningMetrics = buildQualityMetrics({
    plainText: normalized.plainText,
    lines: normalized.lines,
    sections,
    experience,
    contact,
    warningCount: 0,
  });

  const warnings = buildParserWarnings(
    preWarningMetrics,
    sections.some((section) => section.kind === "experience"),
  );

  const quality = buildQualityMetrics({
    plainText: normalized.plainText,
    lines: normalized.lines,
    sections,
    experience,
    contact,
    warningCount: warnings.length,
  });

  const confidence = scoreParseConfidence(quality, warnings);

  return {
    metadata: {
      sourceFileName: metadata.sourceFileName,
      sourceMimeType: metadata.sourceMimeType,
      sourceHash: metadata.sourceHash || createStableSourceHash(normalized.plainText),
      extractor: metadata.extractor || "unknown",
      detectedType: metadata.sourceMimeType,
      plainText: normalized.plainText,
      extractedAt: metadata.extractedAt || new Date().toISOString(),
      warnings,
      confidence,
      quality,
      detectedSections: sections,
    },
    contact,
    summary,
    experience,
    education,
    skills,
  };
}

export function parseResumeForCompatibility(rawText: unknown, metadata: ResumeParserMetadataInput = {}): ResumeParserCompatibilityOutput {
  return toResumeParserCompatibilityOutput(parseResumeDocument(rawText, metadata));
}
