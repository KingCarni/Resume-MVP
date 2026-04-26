import type { ParsedResumeDocument, ResumeParserCompatibilityOutput } from "./types";

export function toResumeParserCompatibilityOutput(document: ParsedResumeDocument): ResumeParserCompatibilityOutput {
  const jobs = document.experience.positions.map((position) => ({
    id: position.id,
    company: position.company ?? "",
    title: position.title ?? "",
    dates: [position.startDate, position.endDate].filter(Boolean).join(" - "),
    location: position.location ?? "",
    bullets: position.bullets.map((bullet) => bullet.text),
  }));

  const bullets = [
    ...document.experience.positions.flatMap((position) => position.bullets.map((bullet) => bullet.text)),
    ...document.experience.unattachedBullets.map((bullet) => bullet.text),
  ];

  return {
    resumeText: document.metadata.plainText,
    bullets,
    jobs,
    sections: Object.fromEntries(
      document.metadata.detectedSections.map((section) => [section.kind, section.lines.join("\n").trim()]),
    ),
    parserDiagnostics: {
      confidence: document.metadata.confidence,
      warnings: document.metadata.warnings,
      quality: document.metadata.quality,
    },
  };
}
