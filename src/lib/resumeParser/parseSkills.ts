import { normalizeForLooseCompare } from "./normalizeText";
import type { DetectedResumeSection, ParsedResumeSkill, ParsedResumeSkills, ResumeSectionKind } from "./types";

const COMMON_SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  "node.js": "node.js",
  nodejs: "node.js",
  "next.js": "next.js",
  nextjs: "next.js",
  qa: "quality assurance",
  uat: "user acceptance testing",
  api: "api testing",
};

function splitSkillCandidates(text: string) {
  return String(text || "")
    .replace(/^â€¢\s+/gm, "")
    .split(/[\n,;|]+/)
    .map((item) => item.replace(/^(skills|technical skills|core skills|areas of expertise)\s*:?\s*/i, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 60)
    .filter((item) => !/\b(19|20)\d{2}\b/.test(item));
}

function normalizeSkill(skill: string) {
  const normalized = normalizeForLooseCompare(skill);
  return COMMON_SKILL_ALIASES[normalized] || normalized;
}

function addSkill(map: Map<string, ParsedResumeSkill>, raw: string, foundIn: ResumeSectionKind) {
  const normalized = normalizeSkill(raw);
  if (!normalized) return;

  const existing = map.get(normalized);
  if (existing) {
    if (!existing.foundIn.includes(foundIn)) existing.foundIn.push(foundIn);
    return;
  }

  map.set(normalized, {
    raw,
    normalized,
    foundIn: [foundIn],
    confidence: foundIn === "skills" ? "confident" : "probable",
  });
}

export function parseSkills(sections: DetectedResumeSection[]): ParsedResumeSkills {
  const map = new Map<string, ParsedResumeSkill>();

  for (const section of sections) {
    if (section.kind !== "skills" && section.kind !== "experience" && section.kind !== "projects") continue;
    const candidates = splitSkillCandidates(section.lines.join("\n"));
    for (const candidate of candidates) {
      if (section.kind !== "skills" && !/[+#.]|\b(sql|api|jira|selenium|playwright|cypress|postman|typescript|javascript|python|java|react|node|aws|azure|gcp|docker|kubernetes)\b/i.test(candidate)) {
        continue;
      }
      addSkill(map, candidate, section.kind);
    }
  }

  const foundIn = Array.from(map.values());
  return {
    raw: foundIn.map((skill) => skill.raw),
    normalized: foundIn.map((skill) => skill.normalized),
    foundIn,
  };
}
