import { normalizeForLooseCompare } from "./normalizeText";
import type { DetectedResumeSection, ParsedResumeSkill, ParsedResumeSkills, ResumeSectionKind } from "./types";

const COMMON_SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  nodejs: "node.js",
  nextjs: "next.js",
  qa: "quality assurance",
  uat: "user acceptance testing",
  jira: "jira",
};

const EXPLICIT_SKILL_LINE_RE =
  /^(?:skills?|technical skills|core skills|areas of expertise|languages?\s*&\s*frameworks?|frameworks?|tooling\s*&\s*delivery|engineering practices|systems\s*&\s*architecture|ai\s*-\s*augmented development)\s*:?\s*/i;
const SKILL_SIGNAL_RE =
  /\b(sql|api|jira|selenium|playwright|cypress|postman|typescript|javascript|python|java|react|node|aws|azure|gcp|docker|kubernetes|unity|vue|confluence|git|ci\/cd|agile|scrum|testing|qa|c#|\.net)\b/i;
const BAD_SKILL_RE =
  /(?:@|https?:\/\/|www\.|linkedin\.com|github\.com|\b(?:built|developed|completed|coordinated|collaborated|organized|ensured|supported|leveraging|improved|owned|served)\b)/i;

function splitSkillCandidates(text: string) {
  return String(text || "")
    .split(/[\n,;|]+/)
    .map((item) => item.replace(EXPLICIT_SKILL_LINE_RE, "").trim())
    .filter(Boolean);
}

function normalizeSkill(skill: string) {
  const normalized = normalizeForLooseCompare(skill);
  return COMMON_SKILL_ALIASES[normalized] || normalized;
}

function isLikelySkill(candidate: string, sectionKind: ResumeSectionKind) {
  const value = String(candidate || "").trim();
  if (!value || value.length < 2 || value.length > 64) return false;
  if (/\b(19|20)\d{2}\b/.test(value)) return false;
  if (BAD_SKILL_RE.test(value)) return false;
  if (/[.!?]$/.test(value)) return false;
  if (value.split(/\s+/).length > 6) return false;
  if (sectionKind !== "skills" && /\b(prodigy education|gatarn games|imagine communications|viral staging|mcmaster|evertz)\b/i.test(value)) return false;
  if (/^(?:c#|\.net)$/i.test(value)) return true;
  if (sectionKind === "skills") return true;
  return SKILL_SIGNAL_RE.test(value);
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
    raw: raw.trim(),
    normalized,
    foundIn: [foundIn],
    confidence: foundIn === "skills" ? "confident" : "probable",
  });
}

function getSectionSkillText(section: DetectedResumeSection) {
  if (section.kind === "skills") return section.lines.join("\n");

  const extracted: string[] = [];
  const joined = section.lines.join(" ");
  const categoryChunks = joined.match(
    /(?:Languages?\s*&\s*Frameworks?|AI\s*-\s*Augmented Development|Systems?\s*&\s*A\s*rchitecture|Systems?\s*&\s*Architecture|Tooling\s*&\s*Delivery|Engineering Practices)\s*:[^:]+?(?=(?:Languages?\s*&\s*Frameworks?|AI\s*-\s*Augmented Development|Systems?\s*&\s*A\s*rchitecture|Systems?\s*&\s*Architecture|Tooling\s*&\s*Delivery|Engineering Practices)\s*:|$)/gi
  );
  if (categoryChunks) extracted.push(...categoryChunks);

  for (const line of section.lines) {
    if (EXPLICIT_SKILL_LINE_RE.test(line)) extracted.push(line.trim());
  }

  return extracted.join("\n");
}

export function parseSkills(sections: DetectedResumeSection[]): ParsedResumeSkills {
  const map = new Map<string, ParsedResumeSkill>();

  for (const section of sections) {
    if (section.kind !== "skills" && section.kind !== "experience" && section.kind !== "projects") continue;

    const skillText = getSectionSkillText(section);
    if (!skillText) continue;

    for (const candidate of splitSkillCandidates(skillText)) {
      if (!isLikelySkill(candidate, section.kind)) continue;
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
