import { classifyBullet, collectLooseBullets, isBulletLine } from "./classifyBullets";
import type { DetectedResumeSection, ParsedResumeExperience, ParsedResumePosition, ResumeFieldConfidence } from "./types";

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const YEAR = "(?:19|20)\\d{2}";
const DATE_TOKEN = `(?:${MONTH}\\s+${YEAR}|\\d{1,2}\\/\\d{4}|${YEAR}|present|current|now)`;
const DATE_RANGE_RE = new RegExp(`\\b(${DATE_TOKEN})\\s*(?:-|to|through|thru)\\s*(${DATE_TOKEN})\\b`, "i");

const SECTION_NOISE_RE = /^(experience|work experience|professional experience|employment history|work history|career history|highlights|skills|education|projects|certifications)\b/i;
const ROLE_HINT_RE = /\b(manager|engineer|developer|analyst|tester|auditor|specialist|coordinator|intern|lead|director|designer|administrator|consultant|associate|representative|host|server|volunteer)\b/i;

function cleanLine(line: string) {
  return String(line || "").trim();
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

function isLikelyPositionHeader(line: string) {
  const trimmed = cleanLine(line);
  if (!trimmed || trimmed.startsWith("• ")) return false;
  if (SECTION_NOISE_RE.test(trimmed)) return false;
  if (trimmed.length > 180) return false;
  if (extractDateRange(trimmed)) return true;
  if (/\s[-|]\s/.test(trimmed) && /[A-Za-z]{3,}/.test(trimmed)) return true;
  return false;
}

function titleConfidence(title?: string): ResumeFieldConfidence {
  if (!title) return "very_unlikely";
  if (ROLE_HINT_RE.test(title)) return "confident";
  if (title.length >= 4) return "probable";
  return "unlikely";
}

function companyConfidence(company?: string): ResumeFieldConfidence {
  if (!company) return "very_unlikely";
  if (/\b(inc|llc|ltd|corp|company|studios|games|systems|solutions|restaurant|hotel|inn|school|university)\b/i.test(company)) return "confident";
  if (company.length >= 3) return "probable";
  return "unlikely";
}

function parseHeaderParts(rawHeaderLines: string[]) {
  const joined = rawHeaderLines.map(cleanLine).filter(Boolean).join(" | ");
  const dateRange = extractDateRange(joined);
  const withoutDate = dateRange
    ? joined.replace(dateRange.raw, "").replace(/\s*[\-|]\s*$/g, "").replace(/\s*\|\s*$/g, "").trim()
    : joined;
  const parts = withoutDate.split(/\s+\|\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);

  let title: string | undefined;
  let company: string | undefined;
  let location: string | undefined;

  if (parts.length >= 3) {
    title = parts[0];
    company = parts[1];
    location = parts.slice(2).join(" - ");
  } else if (parts.length === 2) {
    const [left, right] = parts;
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
  } else if (parts.length === 1) {
    title = parts[0];
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

function flushPendingHeaderIntoCurrent(
  positions: ParsedResumePosition[],
  current: ParsedResumePosition | null,
  pendingHeader: string[]
) {
  if (!pendingHeader.length) {
    return { current, pendingHeader };
  }

  if (current && !current.company && pendingHeader.length === 1 && !extractDateRange(pendingHeader[0])) {
    current.company = pendingHeader[0];
    current.companyConfidence = companyConfidence(current.company);
    return { current, pendingHeader: [] as string[] };
  }

  const nextCurrent = createPosition(pendingHeader, positions.length + 1);
  positions.push(nextCurrent);
  return { current: nextCurrent, pendingHeader: [] as string[] };
}

function parseExperienceLines(lines: string[]) {
  const positions: ParsedResumePosition[] = [];
  const unattachedBulletLines: string[] = [];
  let current: ParsedResumePosition | null = null;
  let pendingHeader: string[] = [];

  const flushPendingHeader = () => {
    const flushed = flushPendingHeaderIntoCurrent(positions, current, pendingHeader);
    current = flushed.current;
    pendingHeader = flushed.pendingHeader;
  };

  const pushHeaderAsNewPosition = (headerLines: string[]) => {
    current = createPosition(headerLines, positions.length + 1);
    positions.push(current);
    pendingHeader = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const line = cleanLine(lines[index]);
    if (!line || SECTION_NOISE_RE.test(line)) continue;

    if (isBulletLine(line)) {
      flushPendingHeader();
      if (current) {
        const activePosition: ParsedResumePosition = current;
        activePosition.bullets.push(classifyBullet(line));
      } else {
        unattachedBulletLines.push(line);
      }
      continue;
    }

    if (isDateOnlyLine(line) && pendingHeader.length) {
      pushHeaderAsNewPosition([...pendingHeader, line]);
      continue;
    }

    if (isLikelyPositionHeader(line)) {
      if (pendingHeader.length) flushPendingHeader();
      pushHeaderAsNewPosition([line]);
      continue;
    }

    if (!current && pendingHeader.length < 2 && line.length <= 90) {
      pendingHeader.push(line);
      continue;
    }

    const activeCurrent = current as ParsedResumePosition | null;

    if (activeCurrent && activeCurrent.bullets.length > 0 && ROLE_HINT_RE.test(line) && line.length <= 90) {
      pendingHeader = [line];
      current = null;
      continue;
    }

    if (activeCurrent && !activeCurrent.company && !extractDateRange(line) && line.length <= 90 && !ROLE_HINT_RE.test(line)) {
      const activePosition: ParsedResumePosition = activeCurrent;
      activePosition.company = line;
      activePosition.companyConfidence = companyConfidence(line);
      continue;
    }

    if (current && shouldAttachAsDescription(line)) {
      const activePosition: ParsedResumePosition = current;
      activePosition.description = [activePosition.description, line].filter(Boolean).join(" ").trim();
      continue;
    }

    if (pendingHeader.length < 2 && line.length <= 90) pendingHeader.push(line);
  }

  flushPendingHeader();

  return {
    positions: positions.filter((position) => position.rawHeaderLines.length || position.bullets.length || position.description),
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
