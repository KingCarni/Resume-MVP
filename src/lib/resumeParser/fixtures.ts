import { parseResumeDocument } from "./index";

export const RESUME_PARSER_FIXTURE_NOTES = [
  "Use Fake Resume / Homer Simpson PDF extracted text as a regression fixture.",
  "Use Fake-Resume template PDF extracted text as a regression fixture.",
  "Assertions should cover section detection, position count, bullet count, date count, and confidence.",
];

export function runResumeParserFixtureSmokeTest(rawText: string) {
  const parsed = parseResumeDocument(rawText, {
    sourceFileName: "fixture.txt",
    sourceMimeType: "text/plain",
    extractor: "plain_text",
  });

  return {
    confidence: parsed.metadata.confidence,
    sections: parsed.metadata.detectedSections.map((section) => section.kind),
    positionCount: parsed.metadata.quality.positionCount,
    bulletCount: parsed.metadata.quality.bulletCount,
    warnings: parsed.metadata.warnings.map((warning) => warning.code),
  };
}
