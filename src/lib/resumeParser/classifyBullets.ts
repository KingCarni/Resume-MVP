import { normalizeForLooseCompare, stripInternalBulletMarker } from "./normalizeText";
import type { ParsedResumeBullet, ResumeBulletType } from "./types";

const ACTION_VERBS = [
  "achieved", "administered", "analyzed", "automated", "built", "coached", "collaborated", "coordinated", "created", "delivered",
  "designed", "developed", "diagnosed", "directed", "documented", "drove", "executed", "facilitated", "implemented", "improved",
  "increased", "led", "managed", "monitored", "optimized", "owned", "performed", "reduced", "resolved", "streamlined", "tested",
];

const TOOL_HINTS = [
  "jira", "selenium", "playwright", "cypress", "postman", "sql", "javascript", "typescript", "python", "java", "api", "rest",
  "github", "git", "jenkins", "docker", "kubernetes", "aws", "azure", "gcp", "excel", "zendesk", "salesforce", "figma", "notion", "confluence",
];

const RAW_BULLET_RE = /^(?:[\s\t]*(?:[•●▪◦‣·*Ã¢â‚¬Â¢Ã¢â€”ÂÃ¯â€šÂ§Ã¢â€“ÂªÃ¢â€“Â«Ã¢â€”Â¦Ã¢â‚¬Â£Ã¢ÂÆ’Ã‚Â·Ã¢â‚¬Â§Ã¢Ë†â„¢Ã¢â€”Â¾Ã¢â€”Â½Ã¢â€“Â Ã¢â€“Â¡Ã¢â€”â€ Ã¢â€”â€¡Ã¢â€“ÂºÃ¢â€“Â¸Ã¢â€“Â¹Ã¢Å¾Â¤Ã¢Å¾Å“Ã¢â€ â€™Ã¢â‚¬ÂºÃ‚Â»Ã¢Å“â€œÃ¢Å“â€Ã¢Ëœâ€˜Ã¢Å“â€¦]|\-)+\s+)/;

function findActionVerb(text: string) {
  const normalized = normalizeForLooseCompare(text);
  return ACTION_VERBS.find((verb) => normalized.startsWith(`${verb} `));
}

function findSkillsMentioned(text: string) {
  const normalized = normalizeForLooseCompare(text);
  return TOOL_HINTS.filter((skill) => normalized.includes(skill));
}

function hasMetric(text: string) {
  return /(?:\b\d+(?:\.\d+)?%\b|\$\s?\d|\b\d+x\b|\b\d+\+?\s*(?:users|customers|tickets|cases|bugs|defects|reports|hours|hrs|days|weeks|months|years)\b)/i.test(text);
}

function classifyBulletType(text: string): ResumeBulletType {
  const normalized = normalizeForLooseCompare(text);

  if (hasMetric(text)) return "metric";
  if (/\b(led|managed|mentored|coached|supervised|trained|owned)\b/.test(normalized)) return "leadership";
  if (findSkillsMentioned(text).length) return "tooling";
  if (/\b(improved|increased|reduced|optimized|streamlined|achieved|delivered|resolved)\b/.test(normalized)) return "achievement";
  if (/\b(responsible for|assisted with|worked on|helped|supported)\b/.test(normalized)) return "weak_or_generic";
  if (findActionVerb(text)) return "responsibility";
  return "unknown";
}

function confidenceForBullet(text: string, type: ResumeBulletType) {
  if (text.length >= 35 && type !== "unknown") return "confident" as const;
  if (text.length >= 20) return "probable" as const;
  if (text.length >= 8) return "unlikely" as const;
  return "very_unlikely" as const;
}

export function classifyBullet(rawText: string): ParsedResumeBullet {
  const text = stripInternalBulletMarker(rawText);
  const type = classifyBulletType(text);
  return {
    text,
    type,
    actionVerb: findActionVerb(text),
    hasMetric: hasMetric(text),
    skillsMentioned: findSkillsMentioned(text),
    confidence: confidenceForBullet(text, type),
  };
}

export function isBulletLine(line: string) {
  const trimmed = String(line || "").trim();
  return trimmed.startsWith("• ") || trimmed.startsWith("Ã¢â‚¬Â¢ ") || RAW_BULLET_RE.test(trimmed);
}

export function collectLooseBullets(lines: string[]) {
  return lines.filter(isBulletLine).map(classifyBullet);
}
