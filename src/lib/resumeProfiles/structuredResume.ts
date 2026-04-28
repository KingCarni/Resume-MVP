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

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => cleanString(item)).filter(Boolean);
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
        bullets: cleanStringArray(section.bullets),
      };
    })
    .filter((section) => section.company || section.title || section.dates || section.location);

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
