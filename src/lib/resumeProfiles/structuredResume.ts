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
      };
    })
    .filter((section) => section.company || section.title || section.dates || section.location);

  return {
    version: 1,
    targetPosition: cleanString(input.targetPosition),
    template: cleanString(input.template) || "modern",
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
