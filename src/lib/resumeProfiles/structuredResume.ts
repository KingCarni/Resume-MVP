import { normalizeStoredResumeTemplateValue } from "@/lib/templates/resumeTemplates";

export type StructuredResumeProfile = {
  fullName: string;
  titleLine: string;
  locationLine: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  summary: string;
};

export type StructuredResumeSection = {
  id: string;
  company: string;
  title: string;
  dates: string;
  location?: string;
  bullets?: string[];
};

export type StructuredResumeSnapshot = {
  version: 1;
  targetPosition: string;
  template: string;
  profile: StructuredResumeProfile;
  sections: StructuredResumeSection[];
  educationItems: string[];
  expertiseItems: string[];
  metaGames: string[];
  metaMetrics: string[];
  shippedLabelMode: string;
  includeMetaInResumeDoc: boolean;
  showShippedBlock: boolean;
  showMetricsBlock: boolean;
  showEducationOnResume: boolean;
  showExpertiseOnResume: boolean;
  showProfilePhoto: boolean;
  profilePhotoDataUrl: string;
  profilePhotoShape: "circle" | "rounded" | "square";
  profilePhotoSize: number;
};

export type ResumeSourceMeta = {
  fileName?: string | null;
  mimeType?: string | null;
  extension?: string | null;
  sourceKind?: string | null;
};

function normalizeStructuredText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00e2\u20ac\u00a2|\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2|\u00ef\u201a\u00b7|\u00ef\u201a\u00a7|\u00e2\u2014\u008f|\u00e2\u2014\u00a6|\u00e2\u2013\u00aa|\u00c2\u00b7/g, "•")
    .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00e2\u20ac\u2015|\u00e2\u20ac\u2014|\u2013|\u2014/g, "-")
    .replace(/\u00e2\u20ac\u0153|\u00e2\u20ac\u009d/g, '"')
    .replace(/\u00e2\u20ac\u02dc|\u00e2\u20ac\u2122/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanString(value: unknown) {
  return normalizeStructuredText(value);
}

function cleanBulletString(value: unknown) {
  return normalizeStructuredText(value)
    .replace(/^(?:[•●◦▪▫·*\-]+\s*)+/g, "")
    .trim();
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const clean = cleanString(item);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out;
}

function cleanBulletArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const clean = cleanBulletString(item);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out;
}

function looksLikeContactOrReferenceLine(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line)) return true;
  if (/\blinkedin\.com\/in\/\S+|\bhttps?:\/\/\S+|\bwww\.\S+/i.test(line)) return true;
  if (/\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/.test(line)) return true;
  if (/^references?$/i.test(line)) return true;
  if (/available\s+upon\s+request/i.test(line)) return true;
  return false;
}

function looksLikeSkillOrMetaHeader(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  return /^(skills|technical skills|core skills|areas of expertise|expertise|toolkit|tools|technologies|platforms|languages|frameworks|certifications?|education|awards|interests)\s*:?/i.test(line);
}

function looksLikeSkillListLine(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  if (looksLikeContactOrReferenceLine(line)) return true;
  if (looksLikeSkillOrMetaHeader(line)) return true;
  if (line.length > 120) return false;
  if (/\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed|delivered|supported|maintained)\b/i.test(line)) return false;

  const separatorCount = (line.match(/[,•|/]/g) || []).length;
  if (separatorCount >= 2) return true;
  if (/^(jira|testrail|selenium|cypress|playwright|postman|figma|unity|unreal|javascript|typescript|python|sql|excel|agile|scrum)\b/i.test(line)) return true;

  return false;
}

function sectionHasEmploymentSignal(section: StructuredResumeSection) {
  if (section.dates && /\b(?:19|20)\d{2}\b|\bpresent\b|\bcurrent\b|\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b/i.test(section.dates)) return true;

  const header = [section.title, section.company].filter(Boolean).join(" ");
  if (/\b(engineer|developer|designer|producer|manager|analyst|specialist|coordinator|lead|director|tester|qa|quality|support|administrator|consultant|intern)\b/i.test(header)) {
    return true;
  }

  return (section.bullets || []).some((bullet) =>
    /\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed|delivered|supported|maintained)\b/i.test(bullet)
  );
}

function shouldDropStructuredSection(section: StructuredResumeSection) {
  const headerLines = [section.company, section.title, section.dates, section.location].filter(Boolean);
  const hasContactHeader = headerLines.some(looksLikeContactOrReferenceLine);
  const hasSkillHeader = headerLines.some(looksLikeSkillOrMetaHeader);
  const hasEmploymentSignal = sectionHasEmploymentSignal(section);
  const bullets = section.bullets || [];

  if (!section.company && !section.title && !section.dates && !section.location) return true;
  if (hasContactHeader && !hasEmploymentSignal) return true;
  if (hasSkillHeader && !hasEmploymentSignal) return true;
  if ((hasContactHeader || hasSkillHeader) && bullets.every(looksLikeSkillListLine)) return true;

  return false;
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}


export function hasStructuredResumeBullets(snapshot: StructuredResumeSnapshot | null | undefined): boolean {
  if (!snapshot) return false;
  return snapshot.sections.some((section) => Array.isArray(section.bullets) && section.bullets.some((bullet) => cleanString(bullet)));
}

export function structuredSnapshotToResumeText(snapshot: StructuredResumeSnapshot | null | undefined): string {
  if (!snapshot) return "";

  const lines: string[] = [];
  const push = (value: unknown = "") => {
    const next = cleanString(value);
    if (next) lines.push(next);
  };

  push(snapshot.profile.fullName);
  push(snapshot.profile.titleLine);
  push(snapshot.profile.locationLine);
  push(snapshot.profile.email);
  push(snapshot.profile.phone);
  push(snapshot.profile.linkedin);
  push(snapshot.profile.portfolio);
  push(snapshot.profile.summary);

  snapshot.sections.forEach((section) => {
    const header = [section.title, section.company, section.dates, section.location].map(cleanString).filter(Boolean).join(' | ');
    push(header);
    (section.bullets || []).forEach((bullet) => push(`- ${bullet}`));
  });

  if (snapshot.educationItems.length) {
    push('Education');
    snapshot.educationItems.forEach((item) => push(`- ${item}`));
  }

  if (snapshot.expertiseItems.length) {
    push('Areas of Expertise');
    snapshot.expertiseItems.forEach((item) => push(`- ${item}`));
  }

  if (snapshot.metaGames.length) {
    push('Games Shipped');
    snapshot.metaGames.forEach((item) => push(`- ${item}`));
  }

  if (snapshot.metaMetrics.length) {
    push('Key Metrics');
    snapshot.metaMetrics.forEach((item) => push(`- ${item}`));
  }

  return lines.join('\n').trim();
}


export function structuredSnapshotToAnalyzeText(snapshot: StructuredResumeSnapshot | null | undefined): string {
  if (!snapshot) return "";

  const lines: string[] = [];
  const push = (value: unknown = "") => {
    const next = cleanString(value);
    if (next) lines.push(next);
  };

  push(snapshot.profile.fullName);
  push(snapshot.profile.titleLine);
  push(snapshot.profile.locationLine);
  push(snapshot.profile.email);
  push(snapshot.profile.phone);
  push(snapshot.profile.linkedin);
  push(snapshot.profile.portfolio);
  push(snapshot.profile.summary);

  if (snapshot.expertiseItems.length) {
    push('Areas of Expertise');
    push(`- ${snapshot.expertiseItems.join(' • ')}`);
  }

  snapshot.sections.forEach((section) => {
    const header = [section.title, section.company, section.dates, section.location]
      .map(cleanString)
      .filter(Boolean)
      .join(' | ');
    push(header);
    (section.bullets || []).forEach((bullet) => push(`- ${bullet}`));
  });

  return lines.join('\n').trim();
}

export function sanitizeResumeSourceMeta(value: unknown): ResumeSourceMeta | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const next: ResumeSourceMeta = {
    fileName: cleanString(input.fileName) || null,
    mimeType: cleanString(input.mimeType) || null,
    extension: cleanString(input.extension).replace(/^\./, "") || null,
    sourceKind: cleanString(input.sourceKind) || null,
  };

  if (!next.fileName && !next.mimeType && !next.extension && !next.sourceKind) return null;
  return next;
}

export function sanitizeStructuredResumeSnapshot(value: unknown): StructuredResumeSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  const profileInput = (input.profile && typeof input.profile === "object" ? input.profile : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(input.sections) ? input.sections : [];
  const sections = rawSections
    .map((item, index) => {
      const section = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return {
        id: cleanString(section.id) || `section_${index + 1}`,
        company: cleanString(section.company),
        title: cleanString(section.title),
        dates: cleanString(section.dates),
        location: cleanString(section.location),
        bullets: cleanBulletArray(section.bullets).filter((bullet) => !looksLikeContactOrReferenceLine(bullet) && !looksLikeSkillOrMetaHeader(bullet)),
      };
    })
    .filter((section) => (section.company || section.title || section.dates || section.location) && !shouldDropStructuredSection(section));

  return {
    version: 1,
    targetPosition: cleanString(input.targetPosition),
    template: normalizeStoredResumeTemplateValue(cleanString(input.template) || "modern"),
    profile: {
      fullName: cleanString(profileInput.fullName),
      titleLine: cleanString(profileInput.titleLine),
      locationLine: cleanString(profileInput.locationLine),
      email: cleanString(profileInput.email),
      phone: cleanString(profileInput.phone),
      linkedin: cleanString(profileInput.linkedin),
      portfolio: cleanString(profileInput.portfolio),
      summary: cleanString(profileInput.summary),
    },
    sections,
    educationItems: cleanStringArray(input.educationItems),
    expertiseItems: cleanStringArray(input.expertiseItems),
    metaGames: cleanStringArray(input.metaGames),
    metaMetrics: cleanStringArray(input.metaMetrics),
    shippedLabelMode: cleanString(input.shippedLabelMode) || "games",
    includeMetaInResumeDoc: cleanBoolean(input.includeMetaInResumeDoc, true),
    showShippedBlock: cleanBoolean(input.showShippedBlock, true),
    showMetricsBlock: cleanBoolean(input.showMetricsBlock, true),
    showEducationOnResume: cleanBoolean(input.showEducationOnResume, true),
    showExpertiseOnResume: cleanBoolean(input.showExpertiseOnResume, true),
    showProfilePhoto: cleanBoolean(input.showProfilePhoto, true),
    profilePhotoDataUrl: cleanString(input.profilePhotoDataUrl),
    profilePhotoShape:
      cleanString(input.profilePhotoShape) === "rounded" || cleanString(input.profilePhotoShape) === "square"
        ? (cleanString(input.profilePhotoShape) as "rounded" | "square")
        : "circle",
    profilePhotoSize: cleanNumber(input.profilePhotoSize, 112),
  };
}
