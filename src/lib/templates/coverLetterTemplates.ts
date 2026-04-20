import type { ResumeLayoutId } from "./baseTokens";
import {
  TEMPLATE_OPTIONS,
  isLegacyResumeTemplateId,
  normalizeLegacyResumeTemplateId,
  normalizeStoredResumeTemplateValue,
  resolveLegacyResumeTemplateSelection,
  type LegacyResumeTemplateId,
  type LegacyResumeTemplateOption,
  type LegacyResumeTemplateSelection,
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
