import type { ResumeLayoutId } from "./baseTokens";
import type { ColorSchemeId } from "./colorSchemes";
import {
  buildResumeTemplateSelection,
  getRecommendedColorSchemeForLayout,
  isLegacyResumeTemplateId,
  normalizeLegacyResumeTemplateId,
  normalizeStoredResumeTemplateValue,
  resolveLegacyResumeTemplateSelection,
  RESUME_COLOR_SCHEME_OPTIONS,
  RESUME_LAYOUT_CATEGORY_LABELS,
  RESUME_LAYOUT_CATEGORY_ORDER,
  type LegacyResumeTemplateSelection,
  type ResumeColorSchemeOption,
  type ResumeLayoutOption,
  type ResumeTemplateId,
  type TemplateMigrationInfo,
} from "./resumeTemplates";

export type CoverLetterLayoutId = "ats" | "classic" | "modern" | "executive" | "serif";
export type CoverLetterTemplateId = ResumeTemplateId;

export type CoverLetterTemplateSelection = LegacyResumeTemplateSelection & {
  coverLetterLayoutId: CoverLetterLayoutId;
};

const COVER_LETTER_LAYOUT_ORDER: CoverLetterLayoutId[] = ["ats", "classic", "modern", "executive", "serif"];
const COVER_LETTER_LAYOUT_SET = new Set<CoverLetterLayoutId>(COVER_LETTER_LAYOUT_ORDER);

const LEGACY_LAYOUT_TO_COVER_LAYOUT: Partial<Record<ResumeLayoutId, CoverLetterLayoutId>> = {
  ats: "ats",
  classic: "classic",
  modern: "modern",
  executive: "executive",
  serif: "serif",
  minimal: "classic",
  compact: "ats",
  sidebar: "modern",
  "sidebar-right": "modern",
  "grid-blueprint": "modern",
  "profile-panel": "classic",
  timeline: "classic",
  "corporate-polished": "executive",
  "technical-grid": "modern",
};

const COVER_LETTER_DEFAULT_COLOR_BY_LAYOUT: Record<CoverLetterLayoutId, ColorSchemeId> = {
  ats: "ats",
  classic: "classic",
  modern: "modern",
  executive: "executive",
  serif: "serif",
};

export const COVER_LETTER_LAYOUT_OPTIONS: ResumeLayoutOption[] = COVER_LETTER_LAYOUT_ORDER.map((layoutId) => ({
  id: layoutId,
  label:
    layoutId === "ats"
      ? "ATS Plain"
      : layoutId === "classic"
        ? "Classic Professional"
        : layoutId === "modern"
          ? "Modern Clean"
          : layoutId === "executive"
            ? "Executive Premium"
            : "Serif Editorial",
  category:
    layoutId === "ats"
      ? "ats-safe"
      : layoutId === "serif"
        ? "editorial"
        : "professional",
  legacyIds: [],
}));

export const COVER_LETTER_LAYOUT_CATEGORY_ORDER = RESUME_LAYOUT_CATEGORY_ORDER.filter((category) =>
  COVER_LETTER_LAYOUT_OPTIONS.some((option) => option.category === category),
);

export const COVER_LETTER_LAYOUT_CATEGORY_LABELS = RESUME_LAYOUT_CATEGORY_LABELS;
export const COVER_LETTER_COLOR_SCHEME_OPTIONS: ResumeColorSchemeOption[] = RESUME_COLOR_SCHEME_OPTIONS;

function isCompositeTemplateId(value: string | null | undefined): boolean {
  return /^layout:[^|]+\|scheme:.+$/i.test(String(value ?? "").trim());
}

function toSupportedCoverLetterLayout(layoutId: ResumeLayoutId): CoverLetterLayoutId {
  return LEGACY_LAYOUT_TO_COVER_LAYOUT[layoutId] ?? "modern";
}

export function isCoverLetterLayoutId(value: string): value is CoverLetterLayoutId {
  return COVER_LETTER_LAYOUT_SET.has(value as CoverLetterLayoutId);
}

export function isCoverLetterTemplateId(value: string): value is CoverLetterTemplateId {
  return isLegacyResumeTemplateId(value) || isCompositeTemplateId(value);
}

export function normalizeLegacyCoverLetterTemplateId(
  value: string | null | undefined,
): TemplateMigrationInfo {
  return normalizeLegacyResumeTemplateId(value);
}

export function normalizeStoredCoverLetterTemplateValue(
  value: string | null | undefined,
): CoverLetterTemplateId {
  const resumeSelection = resolveLegacyResumeTemplateSelection(normalizeStoredResumeTemplateValue(value));
  const coverLetterLayoutId = toSupportedCoverLetterLayout(resumeSelection.layoutId);

  if (resumeSelection.layoutId === coverLetterLayoutId) {
    return resumeSelection.templateId;
  }

  return buildResumeTemplateSelection(coverLetterLayoutId, resumeSelection.colorSchemeId).templateId;
}

export function resolveCoverLetterTemplateSelection(
  templateId: string | null | undefined,
): CoverLetterTemplateSelection {
  const resumeSelection = resolveLegacyResumeTemplateSelection(normalizeStoredResumeTemplateValue(templateId));
  const coverLetterLayoutId = toSupportedCoverLetterLayout(resumeSelection.layoutId);

  if (resumeSelection.layoutId === coverLetterLayoutId) {
    return {
      ...resumeSelection,
      coverLetterLayoutId,
    };
  }

  const normalizedSelection = buildResumeTemplateSelection(coverLetterLayoutId, resumeSelection.colorSchemeId);
  return {
    ...normalizedSelection,
    coverLetterLayoutId,
  };
}

export function buildCoverLetterTemplateSelection(
  layoutId: CoverLetterLayoutId,
  colorSchemeId: ColorSchemeId,
): CoverLetterTemplateSelection {
  const selection = buildResumeTemplateSelection(layoutId, colorSchemeId);
  return {
    ...selection,
    coverLetterLayoutId: layoutId,
  };
}

export function getRecommendedColorSchemeForCoverLetterLayout(
  layoutId: CoverLetterLayoutId,
): ColorSchemeId {
  return COVER_LETTER_DEFAULT_COLOR_BY_LAYOUT[layoutId] ?? getRecommendedColorSchemeForLayout(layoutId);
}
