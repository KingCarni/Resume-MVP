export type JobAgeBucket = "fresh" | "aging" | "stale" | "expired";

export type JobStalenessOptions = {
  freshDays?: number;
  staleDays?: number;
  expireDays?: number;
};

export type JobStalenessResult = {
  bucket: JobAgeBucket;
  ageDays: number | null;
  shouldDeprioritize: boolean;
  shouldExcludeFromBestMatch: boolean;
  label: string | null;
};

const DEFAULTS: Required<JobStalenessOptions> = {
  freshDays: 14,
  staleDays: 30,
  expireDays: 45,
};

function diffInDays(postedAt: Date, now: Date): number {
  const ms = now.getTime() - postedAt.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function getJobStaleness(
  postedAt: Date | string | null | undefined,
  options?: JobStalenessOptions,
  nowInput?: Date
): JobStalenessResult {
  const now = nowInput ?? new Date();
  const cfg = { ...DEFAULTS, ...(options ?? {}) };

  if (!postedAt) {
    return {
      bucket: "aging",
      ageDays: null,
      shouldDeprioritize: false,
      shouldExcludeFromBestMatch: false,
      label: null,
    };
  }

  const date = postedAt instanceof Date ? postedAt : new Date(postedAt);
  if (Number.isNaN(date.getTime())) {
    return {
      bucket: "aging",
      ageDays: null,
      shouldDeprioritize: false,
      shouldExcludeFromBestMatch: false,
      label: null,
    };
  }

  const ageDays = diffInDays(date, now);

  if (ageDays >= cfg.expireDays) {
    return {
      bucket: "expired",
      ageDays,
      shouldDeprioritize: true,
      shouldExcludeFromBestMatch: true,
      label: "Older posting",
    };
  }

  if (ageDays >= cfg.staleDays) {
    return {
      bucket: "stale",
      ageDays,
      shouldDeprioritize: true,
      shouldExcludeFromBestMatch: false,
      label: "Older posting",
    };
  }

  if (ageDays > cfg.freshDays) {
    return {
      bucket: "aging",
      ageDays,
      shouldDeprioritize: false,
      shouldExcludeFromBestMatch: false,
      label: null,
    };
  }

  return {
    bucket: "fresh",
    ageDays,
    shouldDeprioritize: false,
    shouldExcludeFromBestMatch: false,
    label: null,
  };
}

export function applyJobAgePenalty(
  score: number,
  postedAt: Date | string | null | undefined,
  options?: JobStalenessOptions,
  nowInput?: Date
): number {
  const result = getJobStaleness(postedAt, options, nowInput);

  if (result.bucket === "expired") {
    return Math.max(0, score - 25);
  }

  if (result.bucket === "stale") {
    return Math.max(0, score - 8);
  }

  return score;
}
 