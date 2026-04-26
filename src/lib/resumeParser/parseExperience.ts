// TARGET PATH: src/lib/resumeParser/parseExperience.ts
// JOB-139 Pass 5 — smoke fixture regression fix
import { classifyBullet, collectLooseBullets, isBulletLine } from "./classifyBullets";
import type { DetectedResumeSection, ParsedResumeBullet, ParsedResumeExperience, ParsedResumePosition, ResumeFieldConfidence } from "./types";

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const YEAR = "(?:19|20)\\d{2}";
const DATE_TOKEN = `(?:${MONTH}\\s+${YEAR}|\\d{1,2}\\/${YEAR}|${YEAR}|present|current|now)`;
const DATE_RANGE_RE = new RegExp(`\\b(${DATE_TOKEN})\\s*(?:-|to|through|thru)\\s*(${DATE_TOKEN})\\b`, "i");

const SECTION_NOISE_RE = /^(contact|profile|summary|professional summary|career summary|snapshot|career snapshot|overview|experience|work experience|professional experience|employment history|work history|career history|work story|career story|selected work|selected experience|highlights|skills|technical skills|toolbox|toolkit|tools|education|learning|projects|certifications)\b/i;
const ROLE_HINT_RE = /\b(manager|engineer|developer|analyst|tester|auditor|specialist|coordinator|intern|lead|director|designer|administrator|consultant|associate|representative|host|server|volunteer|producer|writer|scrum master)\b/i;
const CONTACT_OR_URL_RE = /(?:@|https?:\/\/|www\.|linkedin\.com|github\.com|\b\d{3}[-.)\s]\d{3})/i;
const DEGREE_RE = /\b(b\.?s\.?c?|bachelor|associate degree|diploma|certificate|college|university|school|polytechnic)\b/i;
const TABLE_LABEL_RE = /^(?:role|title|job title|position|company|employer|organization|dates?|date range|duration|responsibilities?|achievements?)\b\s*:?\s*$/i;
const DIRECT_BULLET_RE = /^[\s\t]*[•◦‣▪*-]\s+/;

function cleanLine(line: string) {
  return String(line || "")
    .replace(/^(?:Role|Title|Job Title|Position)\s*:?\s+(?=.{3,80}$)/i, "")
    .replace(/^(?:Company|Employer|Organization)\s*:?\s+(?=.{3,80}$)/i, "")
    .trim();
}

function isTableLabelOnlyLine(line: string) {
  return TABLE_LABEL_RE.test(String(line || "").trim());
}

function isDirectBulletLine(line: string) {
  return DIRECT_BULLET_RE.test(String(line || ""));
}

function normalizeDirectBulletLine(line: string) {
  return String(line || "").replace(DIRECT_BULLET_RE, "• ").trim();
}

export function extractDateRange(line: string) {
  const match = cleanLine(line).match(DATE_RANGE_RE);
  if (!match) return null;
  const startDate = match[1]?.trim();
  const endDate = match[2]?.trim();
  return {
    startDate,
    endDate,
    isCurrent: /present|current|now/i.test(endDate || ""),
    raw: match[0],
  };
}

function isDateOnlyLine(line: string) {
  const trimmed = cleanLine(line);
  const range = extractDateRange(trimmed);
  if (!range) return false;
  return trimmed.replace(range.raw, "").replace(/[|,()-]/g, "").trim().length <= 4;
}

function looksLikeNarrativeLine(line: string) {
  const trimmed = cleanLine(line);
  if (!trimmed) return false;
  if (trimmed.length > 110) return true;
  if (/[.!?]$/.test(trimmed) && !extractDateRange(trimmed)) return true;
  if (/\b(by|across|through|while|using|with|for|from|into|because)\b/i.test(trimmed) && trimmed.length > 45) return true;
  return false;
}

function isBadHeaderLine(line: string) {
  const trimmed = cleanLine(line);
  if (!trimmed) return true;
  if (isTableLabelOnlyLine(line)) return true;
  if (SECTION_NOISE_RE.test(trimmed)) return true;
  if (CONTACT_OR_URL_RE.test(trimmed)) return true;
  if (DEGREE_RE.test(trimmed)) return true;
  if (/^(figma|notion|jira|confluence|sql|excel|github|documentation)(?:,|$)/i.test(trimmed)) return true;
  return false;
}

function isLikelyPositionHeader(line: string) {
  const trimmed = cleanLine(line);
  if (!trimmed || isBulletLine(trimmed)) return false;
  if (isBadHeaderLine(trimmed)) return false;
  if (trimmed.length > 180) return false;

  const hasDate = !!extractDateRange(trimmed);
  const hasSeparator = /\s[-|]\s/.test(trimmed);
  const hasRole = ROLE_HINT_RE.test(trimmed);

  if (hasDate && (hasRole || hasSeparator) && !looksLikeNarrativeLine(trimmed)) return true;
  if (hasSeparator && hasRole && trimmed.length <= 120) return true;
  return false;
}

function isPossibleTitleLine(line: string) {
  const trimmed = cleanLine(line);
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (isBadHeaderLine(trimmed)) return false;
  if (looksLikeNarrativeLine(trimmed)) return false;
  return ROLE_HINT_RE.test(trimmed);
}

function isPossibleCompanyLine(line: string) {
  const trimmed = cleanLine(line);
  if (trimmed.length < 2 || trimmed.length > 90) return false;
  if (isBadHeaderLine(trimmed)) return false;
  if (looksLikeNarrativeLine(trimmed)) return false;
  if (extractDateRange(trimmed)) return false;
  return true;
}

function titleConfidence(title?: string): ResumeFieldConfidence {
  if (!title) return "very_unlikely";
  if (CONTACT_OR_URL_RE.test(title) || DEGREE_RE.test(title)) return "very_unlikely";
  if (ROLE_HINT_RE.test(title)) return "confident";
  if (title.length >= 4) return "probable";
  return "unlikely";
}

function companyConfidence(company?: string): ResumeFieldConfidence {
  if (!company) return "very_unlikely";
  if (CONTACT_OR_URL_RE.test(company) || DEGREE_RE.test(company)) return "very_unlikely";
  if (/\b(inc|llc|ltd|corp|company|studio|studios|games|systems|solutions|restaurant|hotel|inn|school|university|labs|digital|works|health|media|interactive|cloud)\b/i.test(company)) return "confident";
  if (company.length >= 3) return "probable";
  return "unlikely";
}

function parseHeaderParts(rawHeaderLines: string[]) {
  const joined = rawHeaderLines.map(cleanLine).filter(Boolean).join(" | ");
  const dateRange = extractDateRange(joined);
  const withoutDate = dateRange
    ? joined.replace(dateRange.raw, "").replace(/\s*[\-|]\s*$/g, "").replace(/\s*\|\s*$/g, "").trim()
    : joined;
  const parts = withoutDate
    .replace(/\s+[–—]\s+/g, " - ")
    .split(/\s+\|\s+|\s+-\s+/)
    .map((part) => cleanLine(part).trim())
    .filter(Boolean);

  let title: string | undefined;
  let company: string | undefined;
  let location: string | undefined;

  const usefulParts = parts.filter((part) => !isBadHeaderLine(part) && !isDateOnlyLine(part));

  if (usefulParts.length >= 3) {
    const roleIndex = usefulParts.findIndex((part) => ROLE_HINT_RE.test(part));
    if (roleIndex > 0) {
      company = usefulParts[0];
      title = usefulParts[roleIndex];
      location = usefulParts.slice(roleIndex + 1).join(" - ") || undefined;
    } else {
      title = usefulParts[0];
      company = usefulParts[1];
      location = usefulParts.slice(2).join(" - ");
    }
  } else if (usefulParts.length === 2) {
    const [left, right] = usefulParts;
    if (ROLE_HINT_RE.test(left)) {
      title = left;
      company = right;
    } else if (ROLE_HINT_RE.test(right)) {
      company = left;
      title = right;
    } else {
      title = left;
      company = right;
    }
  } else if (usefulParts.length === 1) {
    title = usefulParts[0];
  }

  return {
    title,
    company,
    location,
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
    isCurrent: !!dateRange?.isCurrent,
  };
}

function splitDescriptionIntoBullets(description: string): ParsedResumeBullet[] {
  const cleaned = cleanLine(description);
  if (!cleaned) return [];

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35)
    .slice(0, 4)
    .map((sentence) => classifyBullet(`• ${sentence.replace(/[.!?]$/, "")}`));
}

function finalizePosition(position: ParsedResumePosition): ParsedResumePosition {
  if (position.bullets.length === 0 && position.description) {
    return {
      ...position,
      bullets: splitDescriptionIntoBullets(position.description),
    };
  }
  return position;
}

function createPosition(rawHeaderLines: string[], index: number): ParsedResumePosition {
  const parsed = parseHeaderParts(rawHeaderLines);
  return {
    id: `position_${index}`,
    title: parsed.title,
    titleConfidence: titleConfidence(parsed.title),
    company: parsed.company,
    companyConfidence: companyConfidence(parsed.company),
    location: parsed.location,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    isCurrent: parsed.isCurrent,
    rawHeaderLines: rawHeaderLines.map(cleanLine).filter(Boolean),
    description: "",
    bullets: [],
  };
}

function shouldAttachAsDescription(line: string) {
  const trimmed = cleanLine(line);
  if (!trimmed || isBulletLine(trimmed)) return false;
  if (SECTION_NOISE_RE.test(trimmed)) return false;
  if (isLikelyPositionHeader(trimmed)) return false;
  return trimmed.length >= 15;
}

function isUsablePosition(position: ParsedResumePosition) {
  const title = position.title || "";
  const company = position.company || "";
  if (position.titleConfidence === "very_unlikely" && position.companyConfidence === "very_unlikely" && !position.bullets.length) return false;
  if (CONTACT_OR_URL_RE.test(title) || CONTACT_OR_URL_RE.test(company)) return false;
  if (DEGREE_RE.test(title)) return false;
  return !!(title || company || position.bullets.length || position.description);
}

function parseExperienceLines(lines: string[]) {
  const positions: ParsedResumePosition[] = [];
  const unattachedBulletLines: string[] = [];
  let current: ParsedResumePosition | null = null;
  let pendingHeader: string[] = [];

  const pushCurrent = (position: ParsedResumePosition) => {
    const finalized = finalizePosition(position);
    if (isUsablePosition(finalized)) positions.push(finalized);
  };

  const startNewPosition = (headerLines: string[]) => {
    if (current) pushCurrent(current);
    current = createPosition(headerLines, positions.length + 1);
    pendingHeader = [];
  };

  const flushPendingHeader = () => {
    if (!pendingHeader.length) return;

    if (current && !current.company && pendingHeader.length === 1 && isPossibleCompanyLine(pendingHeader[0])) {
      current.company = pendingHeader[0];
      current.companyConfidence = companyConfidence(current.company);
      pendingHeader = [];
      return;
    }

    startNewPosition(pendingHeader);
    pendingHeader = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    if (isTableLabelOnlyLine(rawLine)) continue;
    const line = cleanLine(rawLine);
    if (!line || SECTION_NOISE_RE.test(line)) continue;

    if (isBulletLine(line) || isDirectBulletLine(line)) {
      flushPendingHeader();
      const bulletLine = isDirectBulletLine(line) ? normalizeDirectBulletLine(line) : line;
      if (current) {
        const activePosition = current as ParsedResumePosition;
        activePosition.bullets.push(classifyBullet(bulletLine));
      } else {
        unattachedBulletLines.push(bulletLine);
      }
      continue;
    }

    if (isDateOnlyLine(line) && pendingHeader.length) {
      startNewPosition([...pendingHeader, line]);
      continue;
    }

    const activeCurrent = current as ParsedResumePosition | null;

    if (isDateOnlyLine(line) && activeCurrent && !activeCurrent.startDate && !activeCurrent.endDate) {
      const range = extractDateRange(line);
      if (range) {
        activeCurrent.startDate = range.startDate;
        activeCurrent.endDate = range.endDate;
        activeCurrent.isCurrent = range.isCurrent;
        activeCurrent.rawHeaderLines = [...activeCurrent.rawHeaderLines, cleanLine(line)].filter(Boolean);
        continue;
      }
    }

    if (isLikelyPositionHeader(line)) {
      flushPendingHeader();
      startNewPosition([line]);
      continue;
    }

    if (!current && pendingHeader.length === 0 && isPossibleTitleLine(line)) {
      pendingHeader = [line];
      continue;
    }

    if (!current && pendingHeader.length === 1 && isPossibleCompanyLine(line)) {
      pendingHeader.push(line);
      continue;
    }

    if (activeCurrent && isPossibleTitleLine(line) && (activeCurrent.bullets.length > 0 || activeCurrent.description.length > 0)) {
      startNewPosition([line]);
      continue;
    }

    if (activeCurrent && !activeCurrent.company && isPossibleCompanyLine(line) && !ROLE_HINT_RE.test(line)) {
      activeCurrent.company = line;
      activeCurrent.companyConfidence = companyConfidence(line);
      activeCurrent.rawHeaderLines = [...activeCurrent.rawHeaderLines, cleanLine(line)].filter(Boolean);
      continue;
    }

    if (activeCurrent && shouldAttachAsDescription(line)) {
      activeCurrent.description = [activeCurrent.description, line].filter(Boolean).join(" ").trim();
      continue;
    }
  }

  flushPendingHeader();
  if (current) pushCurrent(current);

  return {
    positions,
    unattachedBullets: unattachedBulletLines.map(classifyBullet),
  };
}

export function parseExperience(sections: DetectedResumeSection[]): ParsedResumeExperience {
  const experienceSections = sections.filter((section) => section.kind === "experience");
  const sourceLines = experienceSections.length
    ? experienceSections.flatMap((section) => section.lines)
    : sections.flatMap((section) => section.lines);

  const parsed = parseExperienceLines(sourceLines);
  const looseBullets = collectLooseBullets(sourceLines);

  const positions = parsed.positions.map((position) => ({
    ...position,
    bullets: position.bullets.length ? position.bullets : [],
  }));

  const attachedBulletTexts = new Set(positions.flatMap((position) => position.bullets.map((bullet) => bullet.text.toLowerCase())));
  const unattachedBullets = [
    ...parsed.unattachedBullets,
    ...looseBullets.filter((bullet) => !attachedBulletTexts.has(bullet.text.toLowerCase())),
  ];

  return {
    summary: {},
    positions,
    unattachedBullets,
  };
}

export function countDateRanges(text: string) {
  const globalDateRangeRe = new RegExp(DATE_RANGE_RE.source, `${DATE_RANGE_RE.flags}g`);
  return Array.from(String(text || "").matchAll(globalDateRangeRe)).length;
}
