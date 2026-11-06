export type ResumeParseConfidence = "high" | "medium" | "low";

export type ResumeParserExtractor =
  | "plain_text"
  | "pdf_text"
  | "docx_mammoth"
  | "ocr_google_vision"
  | "unknown";

export type ResumeSectionKind =
  | "contact"
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects"
  | "interests"
  | "unknown";

export type ResumeFieldConfidence =
  | "confident"
  | "probable"
  | "unlikely"
  | "very_unlikely";

export type ResumeBulletType =
  | "achievement"
  | "responsibility"
  | "tooling"
  | "metric"
  | "leadership"
  | "weak_or_generic"
  | "unknown";

export type ResumeParserWarningCode =
  | "EMPTY_TEXT"
  | "LOW_TEXT_LENGTH"
  | "NO_SECTIONS_DETECTED"
  | "NO_EXPERIENCE_SECTION"
  | "NO_POSITIONS_DETECTED"
  | "NO_BULLETS_DETECTED"
  | "LOW_CONTACT_SIGNALS"
  | "MANY_UNATTACHED_BULLETS";

export type ResumeParserWarning = {
  code: ResumeParserWarningCode;
  message: string;
  severity: "info" | "warning" | "error";
};

export type ResumeParserMetadataInput = {
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceHash?: string;
  extractor?: ResumeParserExtractor;
  extractedAt?: string;
};

export type ResumeQualityMetrics = {
  textLength: number;
  lineCount: number;
  sectionCount: number;
  positionCount: number;
  bulletCount: number;
  dateCount: number;
  contactSignalsFound: number;
  warningCount: number;
  unattachedBulletCount: number;
};

export type ParsedResumeMetadata = {
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceHash: string;
  extractor: ResumeParserExtractor;
  detectedType?: string;
  plainText: string;
  extractedAt: string;
  warnings: ResumeParserWarning[];
  confidence: ResumeParseConfidence;
  quality: ResumeQualityMetrics;
  detectedSections: DetectedResumeSection[];
};

export type ParsedResumeContact = {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  links: string[];
  confidence: ResumeFieldConfidence;
};

export type ParsedResumeSummary = {
  rawText: string;
  confidence: ResumeFieldConfidence;
};

export type ParsedResumeBullet = {
  text: string;
  type: ResumeBulletType;
  actionVerb?: string;
  hasMetric: boolean;
  skillsMentioned: string[];
  confidence: ResumeFieldConfidence;
};

export type ParsedResumePosition = {
  id: string;
  title?: string;
  titleConfidence: ResumeFieldConfidence;
  company?: string;
  companyConfidence: ResumeFieldConfidence;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  rawHeaderLines: string[];
  description: string;
  bullets: ParsedResumeBullet[];
};

export type ParsedResumeExperience = {
  summary: {
    monthsOfWorkExperience?: number;
    monthsOfManagementExperience?: number;
    averageMonthsPerEmployer?: number;
    currentSeniorityGuess?: string;
  };
  positions: ParsedResumePosition[];
  unattachedBullets: ParsedResumeBullet[];
};

export type ParsedResumeEducationEntry = {
  id: string;
  institution?: string;
  credential?: string;
  field?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  rawText: string;
  confidence: ResumeFieldConfidence;
};

export type ParsedResumeEducation = {
  entries: ParsedResumeEducationEntry[];
  rawText: string;
};

export type ParsedResumeSkill = {
  raw: string;
  normalized: string;
  foundIn: ResumeSectionKind[];
  confidence: ResumeFieldConfidence;
};

export type ParsedResumeSkills = {
  raw: string[];
  normalized: string[];
  foundIn: ParsedResumeSkill[];
};

export type DetectedResumeSection = {
  kind: ResumeSectionKind;
  heading: string;
  startLine: number;
  endLine: number;
  lines: string[];
  confidence: ResumeFieldConfidence;
};

export type ParsedResumeDocument = {
  metadata: ParsedResumeMetadata;
  contact: ParsedResumeContact;
  summary: ParsedResumeSummary;
  experience: ParsedResumeExperience;
  education: ParsedResumeEducation;
  skills: ParsedResumeSkills;
};

export type ResumeParserCompatibilityOutput = {
  resumeText: string;
  bullets: string[];
  jobs: Array<{
    id: string;
    company: string;
    title: string;
    dates: string;
    location: string;
    bullets: string[];
  }>;
  sections: Record<string, string>;
  parserDiagnostics: {
    confidence: ResumeParseConfidence;
    warnings: ResumeParserWarning[];
    quality: ResumeQualityMetrics;
  };
};
