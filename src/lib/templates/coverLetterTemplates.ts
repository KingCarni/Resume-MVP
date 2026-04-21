import type { ResumeLayoutId } from "./baseTokens";
import type { ColorSchemeId } from "./colorSchemes";
import {
  TEMPLATE_OPTIONS,
  RESUME_COLOR_SCHEME_OPTIONS,
  RESUME_LAYOUT_OPTIONS,
  buildResumeTemplateSelection,
  getRecommendedColorSchemeForLayout,
  isLegacyResumeTemplateId,
  normalizeLegacyResumeTemplateId,
  normalizeStoredResumeTemplateValue,
  resolveLegacyResumeTemplateSelection,
  type LegacyResumeTemplateId,
  type LegacyResumeTemplateOption,
  type LegacyResumeTemplateSelection,
  type ResumeColorSchemeOption,
  type ResumeLayoutOption,
  type TemplateMigrationInfo,
} from "./resumeTemplates";

export type CoverLetterTemplateId = LegacyResumeTemplateId;
export type CoverLetterTemplateOption = LegacyResumeTemplateOption;
export type CoverLetterTemplateSelection = LegacyResumeTemplateSelection & {
  coverLetterLayoutId: ResumeLayoutId;
};

export const COVER_LETTER_TEMPLATE_OPTIONS: CoverLetterTemplateOption[] = TEMPLATE_OPTIONS;

export function isCoverLetterTemplateId(value: string): value is CoverLetterTemplateId {
  return isLegacyResumeTemplateId(value);
}

export function normalizeLegacyCoverLetterTemplateId(
  value: string | null | undefined,
): TemplateMigrationInfo {
  return normalizeLegacyResumeTemplateId(value);
}

export function normalizeStoredCoverLetterTemplateValue(
  value: string | null | undefined,
): CoverLetterTemplateId {
  return normalizeStoredResumeTemplateValue(value);
}

export function resolveCoverLetterTemplateSelection(
  templateId: string | null | undefined,
): CoverLetterTemplateSelection {
  const selection = resolveLegacyResumeTemplateSelection(templateId);
  return {
    ...selection,
    coverLetterLayoutId: selection.layoutId,
  };
}


export const COVER_LETTER_LAYOUT_OPTIONS: ResumeLayoutOption[] = RESUME_LAYOUT_OPTIONS;
export const COVER_LETTER_COLOR_SCHEME_OPTIONS: ResumeColorSchemeOption[] = RESUME_COLOR_SCHEME_OPTIONS;

export function buildCoverLetterTemplateSelection(
  layoutId: ResumeLayoutId,
  colorSchemeId: ColorSchemeId,
): CoverLetterTemplateSelection {
  const selection = buildResumeTemplateSelection(layoutId, colorSchemeId);
  return {
    ...selection,
    coverLetterLayoutId: selection.layoutId,
  };
}

export function getRecommendedColorSchemeForCoverLetterLayout(
  layoutId: ResumeLayoutId,
): ColorSchemeId {
  return getRecommendedColorSchemeForLayout(layoutId);
}
