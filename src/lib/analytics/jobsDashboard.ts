import { prisma } from "@/lib/prisma";

type EventRow = {
  id: string;
  userId: string;
  createdAt: Date;
  type: string;
  metaJson: unknown;
};

type LedgerRow = {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  ref: string | null;
  createdAt: Date;
};

type NormalizedJobsEvent = {
  id: string;
  userId: string;
  createdAt: Date;
  event: string;
  route: string | null;
  jobId: string | null;
  resumeProfileId: string | null;
  sourceSlug: string | null;
  company: string | null;
  jobTitle: string | null;
  mode: string | null;
  creditsCost: number | null;
  matchScore: number | null;
  meta: Record<string, unknown> | null;
  rawType: string;
};

type MetricCard = {
  label: string;
  value: number | string;
  subtext?: string;
};

type TrendPoint = {
  month: string;
  jobsChargedCreditsProxy: number;
  totalCreditsSpent: number;
  purchasedCredits: number;
};

type JobsAnalyticsSummary = {
  range: {
    days: number;
    startAt: string;
    endAt: string;
  };
  eventCount: number;
  ledgerRowCount: number;
  cards: MetricCard[];
  funnel: {
    feedViews: number;
    uniqueJobsActiveUsers: number;
    detailViews: number;
    uniqueDetailUsers: number;
    saveClicks: number;
    saveRatePct: number;
    tailorResumeClicks: number;
    coverLetterClicks: number;
    tailorBothClicks: number;
    paidJobsActions: number;
    paidActionUsers: number;
    paidActionRateAfterDetailPct: number;
    bundleSharePct: number;
  };
  monetization: {
    jobsChargedCreditsProxy: number;
    totalCreditsSpent: number;
    jobsAttributedPurchases: number;
    jobsAttributedPurchasedCredits: number;
    jobsAttributedCheckoutStarts: number;
  };
  retention: {
    repeatJobsVisitors7d: number;
    repeatJobsVisitorRatePct: number;
  };
  eventsByName: Array<{ event: string; count: number }>;
  monthlyTrend: TrendPoint[];
  notes: string[];
};

const JOBS_CATEGORY = "jobs";
const MAX_DAYS = 180;
const DEFAULT_DAYS = 30;
const PURCHASE_REASONS = new Set(["purchase", "credit_purchase", "credits_purchase", "purchase_stripe"]);
const SAVE_EVENTS = new Set(["jobs_save_clicked", "job_detail_save_clicked"]);
const FEED_VIEW_EVENTS = new Set(["jobs_feed_view"]);
const DETAIL_VIEW_EVENTS = new Set(["job_detail_view"]);
const VIEW_EVENTS = new Set(["jobs_feed_view", "job_detail_view"]);
const TAILOR_RESUME_CLICK_EVENTS = new Set(["job_detail_tailor_resume_clicked"]);
const COVER_LETTER_CLICK_EVENTS = new Set(["job_detail_cover_letter_clicked"]);
const TAILOR_BOTH_CLICK_EVENTS = new Set(["job_detail_tailor_both_clicked"]);
const CHARGED_EVENTS = new Set(["job_resume_credit_charged", "job_cover_letter_credit_charged"]);

function clampDays(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, Math.trunc(parsed)));
}

function coerceRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function cleanNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function formatMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthKeys(startAt: Date, endAt: Date) {
  const cursor = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), 1));
  const end = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), 1));
  const keys: string[] = [];

  while (cursor <= end) {
    keys.push(formatMonthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return keys;
}

function normalizeJobsEvent(row: EventRow): NormalizedJobsEvent | null {
  const meta = coerceRecord(row.metaJson);
  if (!meta) return null;
  if (cleanString(meta.category) !== JOBS_CATEGORY) return null;

  const nestedMeta = coerceRecord(meta.meta);
  const creditsCost = cleanNumber(meta.creditsCost ?? nestedMeta?.creditsCost ?? nestedMeta?.creditDelta);

  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    event: cleanString(meta.event) ?? "unknown",
    route: cleanString(meta.route ?? meta.path),
    jobId: cleanString(meta.jobId),
    resumeProfileId: cleanString(meta.resumeProfileId),
    sourceSlug: cleanString(meta.sourceSlug),
    company: cleanString(meta.company),
    jobTitle: cleanString(meta.jobTitle),
    mode: cleanString(meta.mode),
    creditsCost,
    matchScore: cleanNumber(meta.matchScore),
    meta: nestedMeta,
    rawType: row.type,
  };
}

function hasRepeatVisitWithin7d(timestamps: Date[]) {
  if (timestamps.length < 2) return false;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const windowMs = 7 * 24 * 60 * 60 * 1000;

  for (let index = 1; index < sorted.length; index += 1) {
    const diff = sorted[index].getTime() - sorted[index - 1].getTime();
    if (diff > 0 && diff <= windowMs) {
      return true;
    }
  }

  return false;
}

export async function getJobsAnalyticsSummary(daysInput?: unknown): Promise<JobsAnalyticsSummary> {
  const days = clampDays(daysInput);
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - days * 24 * 60 * 60 * 1000);

  const [events, ledgerRows] = await Promise.all([
    prisma.event.findMany({
      where: {
        createdAt: { gte: startAt, lte: endAt },
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        type: true,
        metaJson: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditsLedger.findMany({
      where: {
        createdAt: { gte: startAt, lte: endAt },
      },
      select: {
        id: true,
        userId: true,
        delta: true,
        reason: true,
        ref: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const jobsEvents = events
    .map((row) => normalizeJobsEvent(row))
    .filter((row): row is NormalizedJobsEvent => !!row);

  const eventsByNameMap = new Map<string, number>();
  const jobsActiveUsers = new Set<string>();
  const detailViewUsers = new Set<string>();
  const detailViewerToPaidActionUsers = new Set<string>();
  const detailViewSeenUsers = new Set<string>();
  const paidActionUsers = new Set<string>();
  const repeatVisitCandidates = new Map<string, Date[]>();

  let feedViews = 0;
  let detailViews = 0;
  let saveClicks = 0;
  let tailorResumeClicks = 0;
  let coverLetterClicks = 0;
  let tailorBothClicks = 0;
  let paidJobsActions = 0;
  let jobsChargedCreditsProxy = 0;
  let bundlePaidActions = 0;
  let jobsAttributedPurchases = 0;
  let jobsAttributedPurchasedCredits = 0;
  let jobsAttributedCheckoutStarts = 0;

  for (const event of jobsEvents) {
    jobsActiveUsers.add(event.userId);
    eventsByNameMap.set(event.event, (eventsByNameMap.get(event.event) ?? 0) + 1);

    if (FEED_VIEW_EVENTS.has(event.event)) {
      feedViews += 1;
    }

    if (DETAIL_VIEW_EVENTS.has(event.event)) {
      detailViews += 1;
      detailViewUsers.add(event.userId);
      detailViewSeenUsers.add(event.userId);
    }

    if (SAVE_EVENTS.has(event.event)) {
      saveClicks += 1;
    }

    if (TAILOR_RESUME_CLICK_EVENTS.has(event.event)) {
      tailorResumeClicks += 1;
    }

    if (COVER_LETTER_CLICK_EVENTS.has(event.event)) {
      coverLetterClicks += 1;
    }

    if (TAILOR_BOTH_CLICK_EVENTS.has(event.event)) {
      tailorBothClicks += 1;
    }

    if (CHARGED_EVENTS.has(event.event)) {
      paidJobsActions += 1;
      paidActionUsers.add(event.userId);
      jobsChargedCreditsProxy += Math.max(0, event.creditsCost ?? 0);
      if (event.mode === "apply_pack") {
        bundlePaidActions += 1;
      }
      if (detailViewSeenUsers.has(event.userId)) {
        detailViewerToPaidActionUsers.add(event.userId);
      }
    }

    if (event.event === "job_buy_credits_checkout_started") {
      jobsAttributedCheckoutStarts += 1;
    }

    if (event.event === "job_buy_credits_purchase_completed") {
      jobsAttributedPurchases += 1;
      jobsAttributedPurchasedCredits += Math.max(0, event.creditsCost ?? 0);
      if (detailViewSeenUsers.has(event.userId)) {
        detailViewerToPaidActionUsers.add(event.userId);
      }
    }

    if (VIEW_EVENTS.has(event.event)) {
      const current = repeatVisitCandidates.get(event.userId) ?? [];
      current.push(event.createdAt);
      repeatVisitCandidates.set(event.userId, current);
    }
  }

  const repeatJobsVisitors7d = Array.from(repeatVisitCandidates.values()).filter((timestamps) =>
    hasRepeatVisitWithin7d(timestamps)
  ).length;

  const totalCreditsSpent = ledgerRows.reduce((sum, row) => {
    if (row.delta >= 0) return sum;
    return sum + Math.abs(row.delta);
  }, 0);

  const monthKeys = buildMonthKeys(startAt, endAt);
  const jobsTrendMap = new Map<string, TrendPoint>();

  for (const key of monthKeys) {
    jobsTrendMap.set(key, {
      month: key,
      jobsChargedCreditsProxy: 0,
      totalCreditsSpent: 0,
      purchasedCredits: 0,
    });
  }

  for (const event of jobsEvents) {
    const month = formatMonthKey(event.createdAt);
    const point = jobsTrendMap.get(month);
    if (!point) continue;

    if (CHARGED_EVENTS.has(event.event)) {
      point.jobsChargedCreditsProxy += Math.max(0, event.creditsCost ?? 0);
    }

  }

  for (const row of ledgerRows) {
    const month = formatMonthKey(row.createdAt);
    const point = jobsTrendMap.get(month);
    if (!point) continue;

    if (row.delta < 0) {
      point.totalCreditsSpent += Math.abs(row.delta);
    }

    if (row.delta > 0 && PURCHASE_REASONS.has(row.reason)) {
      point.purchasedCredits += row.delta;
    }
  }

  const monthlyTrend = Array.from(jobsTrendMap.values());
  const eventsByName = Array.from(eventsByNameMap.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event));

  const saveRatePct = percent(saveClicks, Math.max(detailViews, 1));
  const paidActionRateAfterDetailPct = percent(
    detailViewerToPaidActionUsers.size,
    Math.max(detailViewUsers.size, 1)
  );
  const repeatJobsVisitorRatePct = percent(repeatJobsVisitors7d, Math.max(jobsActiveUsers.size, 1));
  const bundleSharePct = percent(bundlePaidActions, Math.max(paidJobsActions, 1));

  const cards: MetricCard[] = [
    {
      label: `Jobs-active users (${days}d)`,
      value: jobsActiveUsers.size,
      subtext: "Unique users with any jobs-category event in range.",
    },
    {
      label: "Feed views",
      value: feedViews,
      subtext: "Raw /jobs or saved-jobs feed loads captured by the jobs event stream.",
    },
    {
      label: "Job detail views",
      value: detailViews,
      subtext: `${detailViewUsers.size} unique ${detailViewUsers.size === 1 ? "user" : "users"} opened at least one job detail in range.`,
    },
    {
      label: "Paid action rate after detail",
      value: `${paidActionRateAfterDetailPct}%`,
      subtext: "Unique detail viewers who later triggered a paid jobs action or jobs-attributed purchase in range.",
    },
    {
      label: "Jobs charged credits (proxy)",
      value: jobsChargedCreditsProxy,
      subtext: "Event-derived proxy from jobs charged events. Useful for flow analysis, but not a ledger-truth financial total.",
    },
    {
      label: "Repeat jobs visitors within 7d",
      value: `${repeatJobsVisitors7d} (${repeatJobsVisitorRatePct}%)`,
      subtext: "Users with at least two feed/detail visits within a 7-day window.",
    },
  ];

  const notes = [
    "JOB-72 instrumentation exists in the repo; this dashboard converts the existing event stream into practical KPIs.",
    "Paid action rate after detail is intentionally defined as a defensible product metric, not fake revenue attribution precision.",
    "Jobs-attributed purchase metrics only populate when users reach buy-credits from a jobs-context route that passes attribution metadata.",
    "Jobs charged credits is intentionally labeled as an event-derived proxy. Use total credits spent as the ledger-truth financial number.",
    "Monthly purchased credits trend includes purchase ledger rows product-wide; jobs-attributed purchase events are shown separately above.",
  ];

  return {
    range: {
      days,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    },
    eventCount: jobsEvents.length,
    ledgerRowCount: ledgerRows.length,
    cards,
    funnel: {
      feedViews,
      uniqueJobsActiveUsers: jobsActiveUsers.size,
      detailViews,
      uniqueDetailUsers: detailViewUsers.size,
      saveClicks,
      saveRatePct,
      tailorResumeClicks,
      coverLetterClicks,
      tailorBothClicks,
      paidJobsActions,
      paidActionUsers: paidActionUsers.size,
      paidActionRateAfterDetailPct,
      bundleSharePct,
    },
    monetization: {
      jobsChargedCreditsProxy,
      totalCreditsSpent,
      jobsAttributedPurchases,
      jobsAttributedPurchasedCredits,
      jobsAttributedCheckoutStarts,
    },
    retention: {
      repeatJobsVisitors7d,
      repeatJobsVisitorRatePct,
    },
    eventsByName,
    monthlyTrend,
    notes,
  };
}
