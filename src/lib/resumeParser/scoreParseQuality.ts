import { countContactSignals } from "./parseContact";
import { countDateRanges } from "./parseExperience";
import type { ParsedResumeContact, ParsedResumeExperience, ResumeParseConfidence, ResumeParserWarning, ResumeQualityMetrics, DetectedResumeSection } from "./types";

export function buildQualityMetrics(args: {
  plainText: string;
  lines: string[];
  sections: DetectedResumeSection[];
  experience: ParsedResumeExperience;
  contact: ParsedResumeContact;
  warningCount?: number;
}): ResumeQualityMetrics {
  const positionCount = args.experience.positions.length;
  const bulletCount = args.experience.positions.reduce((sum, position) => sum + position.bullets.length, 0) + args.experience.unattachedBullets.length;

  return {
    textLength: args.plainText.length,
    lineCount: args.lines.length,
    sectionCount: args.sections.filter((section) => section.kind !== "unknown" && section.kind !== "contact").length,
    positionCount,
    bulletCount,
    dateCount: countDateRanges(args.plainText),
    contactSignalsFound: countContactSignals(args.contact),
    warningCount: args.warningCount ?? 0,
    unattachedBulletCount: args.experience.unattachedBullets.length,
  };
}

export function buildParserWarnings(metrics: ResumeQualityMetrics, hasExperienceSection: boolean): ResumeParserWarning[] {
  const warnings: ResumeParserWarning[] = [];

  if (metrics.textLength <= 0) {
    warnings.push({ code: "EMPTY_TEXT", severity: "error", message: "No resume text was extracted." });
  } else if (metrics.textLength < 350) {
    warnings.push({ code: "LOW_TEXT_LENGTH", severity: "warning", message: "Extracted resume text is unusually short." });
  }

  if (metrics.sectionCount === 0) {
    warnings.push({ code: "NO_SECTIONS_DETECTED", severity: "warning", message: "No clear resume sections were detected." });
  }

  if (!hasExperienceSection) {
    warnings.push({ code: "NO_EXPERIENCE_SECTION", severity: "warning", message: "No dedicated experience section was detected." });
  }

  if (metrics.positionCount === 0) {
    warnings.push({ code: "NO_POSITIONS_DETECTED", severity: "warning", message: "No employment positions were confidently detected." });
  }

  if (metrics.bulletCount === 0) {
    warnings.push({ code: "NO_BULLETS_DETECTED", severity: "warning", message: "No resume bullets were confidently detected." });
  }

  if (metrics.contactSignalsFound <= 1) {
    warnings.push({ code: "LOW_CONTACT_SIGNALS", severity: "info", message: "Few contact signals were detected." });
  }

  if (metrics.unattachedBulletCount >= 4) {
    warnings.push({ code: "MANY_UNATTACHED_BULLETS", severity: "info", message: "Several bullets were found but could not be attached to a position." });
  }

  return warnings;
}

export function scoreParseConfidence(metrics: ResumeQualityMetrics, warnings: ResumeParserWarning[]): ResumeParseConfidence {
  if (warnings.some((warning) => warning.severity === "error")) return "low";

  let score = 0;
  if (metrics.textLength >= 900) score += 20;
  else if (metrics.textLength >= 450) score += 10;

  if (metrics.sectionCount >= 3) score += 20;
  else if (metrics.sectionCount >= 2) score += 12;
  else if (metrics.sectionCount >= 1) score += 6;

  if (metrics.positionCount >= 2) score += 20;
  else if (metrics.positionCount === 1) score += 12;

  if (metrics.bulletCount >= 5) score += 20;
  else if (metrics.bulletCount >= 2) score += 12;
  else if (metrics.bulletCount === 1) score += 5;

  if (metrics.dateCount >= 2) score += 10;
  else if (metrics.dateCount === 1) score += 5;

  if (metrics.contactSignalsFound >= 2) score += 10;
  else if (metrics.contactSignalsFound === 1) score += 4;

  score -= warnings.filter((warning) => warning.severity === "warning").length * 5;

  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
