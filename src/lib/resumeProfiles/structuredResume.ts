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
  if (!section.dates && bullets.length === 0 && headerLines.length && headerLines.every(looksLikeStructuredSkillPhrase)) return true;
  if (!section.dates && bullets.length === 0 && headerLines.some(looksLikeSkillListLine)) return true;

  return false;
}


function looksLikeStructuredAchievementOrSentence(value: unknown) {
  const line = cleanString(value);
  if (!line) return true;
  const words = line.split(/\s+/).filter(Boolean);
  if (line.length > 90 || words.length > 8) return true;
  if (/[.!?]$/.test(line) && line.length > 28) return true;
  if (/\b(?:by|from|to|through|across|while|using|with|including|supporting|contributing|lowering|improving|reducing|increasing)\b/i.test(line) && words.length > 5) return true;
  if (/%|\$\s?\d|\b\d+(?:\.\d+)?x\b|\b\d+(?:\.\d+)?\s?(?:ms|sec|secs|minutes|min|hrs|hours|days|weeks)\b/i.test(line)) return true;
  if (/\b(main contributor|release owner|production stability|hotfixes|regression testing|stakeholders?|requirements?|conversion|revenue|retention|churn|iteration time|maintenance costs|daily active users|live service|clinical environment)\b/i.test(line)) return true;
  return /\b(improved|managed|created|led|owned|tested|built|designed|implemented|automated|reduced|increased|shipped|launched|coordinated|analyzed|validated|executed|served|supported|reviewed|prepared|piloted|collaborated|developed|maintained|organized|hosted|delegated|completed|gathered|applied|architected|drove|integrated|worked|resolved|delivered|accelerated|upholding|contributed|participated|communicated|aligned)\b/i.test(line);
}

function looksLikeStructuredExperienceBoundary(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  return /\b(?:professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects)\b/i.test(line);
}

function containsStructuredDateRange(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  return /\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|(?:19|20)\d{2})\s*(?:-|–|—|to|through|thru)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(?:19|20)\d{2}|(?:19|20)\d{2}|present|current|now)\b/i.test(line);
}

function looksLikeStructuredSkillPhrase(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  if (looksLikeContactOrReferenceLine(line)) return true;
  if (looksLikeSkillOrMetaHeader(line)) return true;
  if (looksLikeStructuredExperienceBoundary(line)) return true;
  if (containsStructuredDateRange(line)) return false;
  if (looksLikeStructuredAchievementOrSentence(line)) return false;
  if (/\b(?:lead|manager|director|engineer|developer|analyst|specialist|coordinator|producer|designer|administrator|consultant|intern)\b/i.test(line)) return false;

  const knownSkillOrDomain = /\b(?:qa|quality|testing|test|automation|automated|selenium|cypress|playwright|postman|jira|testrail|zephyr|confluence|excel|powerbi|perforce|unity|unreal|ue4|ue5|vr|biomedical|typescript|javascript|react|vue|node|sql|c#|\.net|java|python|docker|git|github|bitbucket|jenkins|ci\/?cd|agile|scrum|kanban|sdlc|oop|rest|api|apis|microservices|distributed|scalable|systems|architecture|prompt engineering|copilot|codex|growthbook|a\/?b testing|stakeholder|communication|documentation|test case|smoke checks|health checks|game testing|cross-platform|frameworks?|process optimization|process excellence|module testing|cloud migration|unit testing|code reviews|design patterns)\b/i;
  return knownSkillOrDomain.test(line);
}

function truncateStructuredCandidateAtBoundary(value: unknown) {
  let line = cleanString(value);
  if (!line) return "";
  const patterns = [
    /\b(?:professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects)\b/i,
    /\b(?:qa lead|software engineer|software test engineer|dev support|full-stack software engineer|freelancer developer|software design engineer internship)\s*[|,]/i,
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match && typeof match.index === "number" && match.index > 0) {
      line = line.slice(0, match.index).trim();
    }
  }
  return line;
}

function splitStructuredExpertiseCandidates(value: unknown) {
  const raw = String(value ?? "")
    .replace(/\u00e2\u20ac\u00a2|\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2|\u00ef\u201a\u00b7|\u00ef\u201a\u00a7|\u00e2\u2014\u008f|\u00e2\u2014\u00a6|\u00e2\u2013\u00aa|\u00c2\u00b7/g, "•")
    .replace(/\u00e2\u20ac\u201c|\u00e2\u20ac\u201d|\u00e2\u20ac\u2015|\u00e2\u20ac\u2014|\u2013|\u2014/g, "-");

  return raw
    .replace(/\b(?:professional experience|work experience|job experience|employment history|career history|experience|education|certifications?|certificates|projects)\b/gi, "\n$&")
    .split(/\r?\n|\s*[•|;,]\s*|\s+\/\s+/)
    .map((candidate) => truncateStructuredCandidateAtBoundary(candidate))
    .map((candidate) => cleanString(candidate.replace(/^(?:languages?\s*&\s*frameworks?|frameworks?|ai[-\s]augmented development|systems?\s*&\s*architecture|tooling\s*&\s*delivery|engineering practices|technical skills|core skills|skills|tools|technologies|areas of expertise|expertise)\s*:\s*/i, "")))
    .filter(Boolean);
}

function isAllowedStructuredExpertiseItem(value: unknown) {
  const item = cleanString(value);
  if (!item) return false;
  if (item.length < 2 || item.length > 64) return false;
  if (/^(linkedin|github|portfolio|email|e-mail|phone|mobile|summary|profile|contact)$/i.test(item)) return false;
  if (/\b(?:gmail|hotmail|outlook|yahoo)\.com\b/i.test(item)) return false;
  if (looksLikeContactOrReferenceLine(item)) return false;
  if (looksLikeSkillOrMetaHeader(item)) return false;
  if (looksLikeStructuredExperienceBoundary(item)) return false;
  if (containsStructuredDateRange(item)) return false;
  if (looksLikeStructuredAchievementOrSentence(item)) return false;

  const knownSkillOrDomain = /\b(?:qa|quality|testing|test|automation|automated|selenium|cypress|playwright|postman|jira|testrail|zephyr|confluence|excel|powerbi|perforce|unity|unreal|ue4|ue5|vr|biomedical|typescript|javascript|react|vue|node|sql|c#|\.net|java|python|docker|git|github|bitbucket|jenkins|ci\/?cd|agile|scrum|kanban|sdlc|oop|rest|api|apis|microservices|distributed|scalable|systems|architecture|prompt engineering|copilot|codex|growthbook|a\/?b testing|stakeholder|communication|documentation|test case|smoke checks|health checks|game testing|cross-platform|frameworks?|process optimization|process excellence|module testing|cloud migration|unit testing|code reviews|design patterns)\b/i;
  if (knownSkillOrDomain.test(item)) return true;

  const words = item.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  if (/[.!?]/.test(item)) return false;
  return /^[A-Za-z0-9+#./&() -]+$/.test(item);
}

function sanitizeStructuredExpertiseItems(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    for (const candidate of splitStructuredExpertiseCandidates(item)) {
      if (!isAllowedStructuredExpertiseItem(candidate)) continue;
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(candidate);
      if (out.length >= 18) return out;
    }
  }

  return out;
}


function looksLikeBadStructuredProfileName(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  if (looksLikeStructuredExperienceBoundary(line)) return true;
  if (looksLikeSkillOrMetaHeader(line)) return true;
  if (looksLikeStructuredAchievementOrSentence(line)) return true;
  if (/^(?:intricate|unorthodox|moldable|professional experience|job experience|skills|summary|profile)$/i.test(line)) return true;
  if (/[.!?]$/.test(line)) return true;
  return false;
}

function looksLikeBadStructuredLocationLine(value: unknown) {
  const line = cleanString(value);
  if (!line) return false;
  if (looksLikeContactOrReferenceLine(line)) return false;
  if (looksLikeStructuredAchievementOrSentence(line)) return true;
  if (line.split(/\s+/).length > 8) return true;
  if (/[.!?]$/.test(line)) return true;
  return false;
}

function sanitizeStructuredProfile(profileInput: Record<string, unknown>): StructuredResumeProfile {
  const fullName = cleanString(profileInput.fullName);
  const locationLine = cleanString(profileInput.locationLine);
  const email = cleanString(profileInput.email);
  const portfolio = cleanString(profileInput.portfolio);

  return {
    fullName: looksLikeBadStructuredProfileName(fullName) ? "" : fullName,
    titleLine: cleanString(profileInput.titleLine),
    locationLine: looksLikeBadStructuredLocationLine(locationLine) ? "" : locationLine,
    email,
    phone: cleanString(profileInput.phone),
    linkedin: cleanString(profileInput.linkedin),
    portfolio: portfolio && email && portfolio.toLowerCase().includes(String(email.split("@")[1] || "").toLowerCase()) ? "" : portfolio,
    summary: cleanString(profileInput.summary),
  };
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
    profile: sanitizeStructuredProfile(profileInput),
    sections,
    educationItems: cleanStringArray(input.educationItems),
    expertiseItems: sanitizeStructuredExpertiseItems(input.expertiseItems),
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
