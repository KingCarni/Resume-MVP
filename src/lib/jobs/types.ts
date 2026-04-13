export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "freelance"
  | "unknown";

export type JobStatus = "active" | "closed" | "expired" | "draft";

export type SortMode = "match" | "newest" | "salary";

export type NormalizedJobInput = {
  sourceSlug: string;
  externalId?: string | null;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: RemoteType;
  employmentType?: EmploymentType;
  seniority?: string | null;
  description: string;
  requirementsText?: string | null;
  responsibilitiesText?: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  postedAt?: string | Date | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  rawPayload?: unknown;
};

export type ResumeProfileInput = {
  id: string;
  userId: string;
  normalizedSkills: string[];
  normalizedTitles: string[];
  seniority?: string | null;
  yearsExperience?: number | null;
  keywords?: string[];
  summary?: string | null;
};

export type JobFilters = {
  q?: string;
  remote?: boolean;
  location?: string;
  seniority?: string;
  minSalary?: number;
  sort?: SortMode;
  page?: number;
  pageSize?: number;
};

export type MatchBreakdown = {
  totalScore: number;
  titleScore: number;
  skillScore: number;
  seniorityScore: number;
  keywordScore: number;
  locationScore: number;
};

export type MatchResult = MatchBreakdown & {
  matchingSkills: string[];
  missingSkills: string[];
  shortReasons: string[];
  explanationShort: string;
};

export type JobCardViewModel = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: string | null;
  score?: number;
  shortReasons?: string[];
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 30;
