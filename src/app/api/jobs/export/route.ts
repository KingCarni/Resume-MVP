import { Prisma, RemoteType, SeniorityLevel } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { chargeCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import {
  getTargetPositionPriority,
  isRoleCandidateAllowedForTarget,
} from "@/lib/jobs/roleFamilies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];
const EXPORT_TIERS = {
  match50: { credits: 10, limit: 50, label: "Top 50 matched jobs" },
  match100: { credits: 15, limit: 100, label: "Top 100 matched jobs" },
  lite: { credits: 25, limit: 500, label: "Top 500 filtered jobs" },
  plus: { credits: 50, limit: 2000, label: "Top 2,000 filtered jobs" },
  admin: { credits: 0, limit: 10000, label: "Admin full export" },
} as const;

type ExportTier = keyof typeof EXPORT_TIERS;

const EXPORT_REASON_BY_TIER: Record<ExportTier, string> = {
  match50: "export_jobs_match_50",
  match100: "export_jobs_match_100",
  lite: "export_jobs_500",
  plus: "export_jobs_2000",
  admin: "export_jobs_admin",
};

const MATCH_EXPORT_SCAN_CAP = 5000;
const FILTERED_EXPORT_SCAN_CAP = 5000;

type ExportRequestBody = {
  tier?: ExportTier;
  resumeProfileId?: string | null;
  q?: string | null;
  remote?: string | null;
  location?: string | null;
  seniority?: string | null;
  minSalary?: string | number | null;
  targetPosition?: string | null;
  sort?: "match" | "newest" | "salary" | null;
};

type ExportRowJob = {
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: SeniorityLevel;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  postedAt: Date | null;
  createdAt: Date;
  source: { slug: string; name: string } | null;
  savedBy: Array<{ id: string }>;
  applications: Array<{ status: string; updatedAt: Date }>;
};

type ExportItem = {
  job: ExportRowJob;
  match: {
    totalScore: number;
    matchingSkills: unknown;
    missingSkills: unknown;
  } | null;
};

function json(payload: unknown, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function isAdminEmail(email: string | null | undefined) {
  const normalized = normalizeString(email).toLowerCase();
  return !!normalized && ADMIN_EMAILS.includes(normalized);
}

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  const email = normalizeString(session?.user?.email).toLowerCase();
  if (!email) return { session, user: null, isAdmin: false };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  return { session, user, isAdmin: isAdminEmail(email) };
}

function parseNullableInt(value: unknown): number | null {
  const raw = normalizeString(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/[^\d]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function normalizeRemote(value: unknown): RemoteType | null {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || normalized === "all") return null;
  if ((Object.values(RemoteType) as string[]).includes(normalized)) {
    return normalized as RemoteType;
  }
  return null;
}

function normalizeSeniority(value: unknown): SeniorityLevel | null {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || normalized === "all") return null;
  if ((Object.values(SeniorityLevel) as string[]).includes(normalized)) {
    return normalized as SeniorityLevel;
  }
  return null;
}

function buildExportWhere(
  body: ExportRequestBody,
  userId: string,
): Prisma.JobWhereInput {
  const q = normalizeString(body.q);
  const location = normalizeString(body.location);
  const remote = normalizeRemote(body.remote);
  const seniority = normalizeSeniority(body.seniority);
  const minSalary = parseNullableInt(body.minSalary);

  return {
    status: "active",
    hiddenBy: { none: { userId } },
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { company: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
    ...(location
      ? {
          OR: [
            { location: { contains: location, mode: Prisma.QueryMode.insensitive } },
            { locationNormalized: { contains: location.toLowerCase() } },
          ],
        }
      : {}),
    ...(remote ? { remoteType: remote } : {}),
    ...(seniority ? { seniority } : {}),
    ...(minSalary != null
      ? {
          OR: [
            { salaryMin: { gte: minSalary } },
            { salaryMax: { gte: minSalary } },
          ],
        }
      : {}),
  };
}

function orderByForExport(sort: ExportRequestBody["sort"]) {
  if (sort === "salary") {
    return [
      { salaryMax: "desc" as const },
      { salaryMin: "desc" as const },
      { postedAt: "desc" as const },
      { createdAt: "desc" as const },
    ];
  }
  return [{ postedAt: "desc" as const }, { createdAt: "desc" as const }];
}

function safeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatSalary(job: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}) {
  const currency = job.salaryCurrency || "";
  if (job.salaryMin == null && job.salaryMax == null) return "";
  if (job.salaryMin != null && job.salaryMax != null)
    return `${currency} ${job.salaryMin}-${job.salaryMax}`.trim();
  if (job.salaryMin != null) return `${currency} ${job.salaryMin}+`.trim();
  return `${currency} up to ${job.salaryMax}`.trim();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExcelHtml(args: { title: string; rows: Array<Record<string, unknown>> }) {
  const columns = Object.keys(args.rows[0] ?? {
    title: "",
    company: "",
    location: "",
    remoteType: "",
    seniority: "",
    salary: "",
    source: "",
    applyUrl: "",
    postedAt: "",
    matchScore: "",
    strongSignals: "",
    likelyGaps: "",
    saved: "",
    applicationStatus: "",
  });

  const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = args.rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`)
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(args.title)}</title>
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #0f172a; color: #ffffff; font-weight: 700; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

function limitForScan(limit: number, hasTargetPosition: boolean) {
  if (!hasTargetPosition) return limit;
  return Math.min(FILTERED_EXPORT_SCAN_CAP, Math.max(limit * 5, limit));
}

function filterAndRankExportItems(
  items: ExportItem[],
  body: ExportRequestBody,
  limit: number,
): ExportItem[] {
  const targetPosition = normalizeString(body.targetPosition);
  const sort = body.sort ?? "match";

  const allowed = targetPosition
    ? items.filter((item) =>
        isRoleCandidateAllowedForTarget(targetPosition, item.job.title),
      )
    : items;

  if (sort === "match") {
    return allowed
      .sort((a, b) => {
        const scoreA = a.match?.totalScore ?? -1;
        const scoreB = b.match?.totalScore ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const priorityA = getTargetPositionPriority(targetPosition, a.job.title);
        const priorityB = getTargetPositionPriority(targetPosition, b.job.title);
        if (priorityB !== priorityA) return priorityB - priorityA;
        const postedA = a.job.postedAt?.getTime() ?? a.job.createdAt.getTime();
        const postedB = b.job.postedAt?.getTime() ?? b.job.createdAt.getTime();
        return postedB - postedA;
      })
      .slice(0, limit);
  }

  return allowed.slice(0, limit);
}

async function getExportItems(args: {
  body: ExportRequestBody;
  userId: string;
  limit: number;
}): Promise<ExportItem[]> {
  const where = buildExportWhere(args.body, args.userId);
  const resumeProfileId = normalizeString(args.body.resumeProfileId);
  const targetPosition = normalizeString(args.body.targetPosition);
  const sort = args.body.sort ?? "match";

  if (sort === "match" && resumeProfileId) {
    const matches = await prisma.jobMatch.findMany({
      where: {
        userId: args.userId,
        resumeProfileId,
        job: where,
      },
      orderBy: [{ totalScore: "desc" }, { updatedAt: "desc" }],
      take: Math.min(
        MATCH_EXPORT_SCAN_CAP,
        Math.max(args.limit, targetPosition ? args.limit * 5 : args.limit),
      ),
      include: {
        job: {
          include: {
            source: true,
            savedBy: { where: { userId: args.userId }, take: 1 },
            applications: {
              where: { userId: args.userId },
              take: 1,
              orderBy: { updatedAt: "desc" },
            },
          },
        },
      },
    });

    return filterAndRankExportItems(
      matches.map((match) => ({
        job: match.job,
        match: {
          totalScore: match.totalScore,
          matchingSkills: match.matchingSkills,
          missingSkills: match.missingSkills,
        },
      })),
      args.body,
      args.limit,
    );
  }

  const jobs = await prisma.job.findMany({
    where,
    include: {
      source: true,
      savedBy: { where: { userId: args.userId }, take: 1 },
      applications: {
        where: { userId: args.userId },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
      matches: {
        where: resumeProfileId
          ? { userId: args.userId, resumeProfileId }
          : { id: "__no_resume_profile_selected__" },
        take: 1,
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: orderByForExport(sort),
    take: limitForScan(args.limit, Boolean(targetPosition)),
  });

  return filterAndRankExportItems(
    jobs.map((job) => {
      const match = resumeProfileId ? job.matches?.[0] : null;
      return {
        job,
        match: match
          ? {
              totalScore: match.totalScore,
              matchingSkills: match.matchingSkills,
              missingSkills: match.missingSkills,
            }
          : null,
      };
    }),
    args.body,
    args.limit,
  );
}

export async function GET(request: NextRequest) {
  const { user, isAdmin } = await getSessionUser();
  if (!user) return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (request.nextUrl.searchParams.get("check") === "1") {
    return json({ ok: true, isAdmin });
  }
  return json({ ok: false, error: "Unsupported export request" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const { user, isAdmin } = await getSessionUser();
    if (!user) return json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as ExportRequestBody;
    const requestedTier = body.tier || "match50";
    const tier: ExportTier = requestedTier in EXPORT_TIERS ? requestedTier : "match50";

    if (tier === "admin" && !isAdmin) {
      return json({ ok: false, error: "Admin export is forbidden." }, { status: 403 });
    }

    const tierConfig = EXPORT_TIERS[tier];

    if (tier !== "admin") {
      const charge = await chargeCredits({
        userId: user.id,
        cost: tierConfig.credits,
        reason: EXPORT_REASON_BY_TIER[tier],
        eventType: "purchase",
        meta: {
          feature: "jobs_export",
          tier,
          limit: tierConfig.limit,
          label: tierConfig.label,
          sort: body.sort ?? "match",
          resumeProfileId: normalizeString(body.resumeProfileId) || undefined,
          targetPosition: normalizeString(body.targetPosition) || undefined,
        },
      });

      if (!charge.ok) {
        return json(
          {
            ok: false,
            error: `Not enough credits. This export costs ${tierConfig.credits} credits.`,
            balance: charge.balance,
          },
          { status: 402 },
        );
      }
    }

    const items = await getExportItems({
      body,
      userId: user.id,
      limit: tierConfig.limit,
    });

    const rows = items.map(({ job, match }) => ({
      title: job.title,
      company: job.company,
      location: job.location ?? "",
      remoteType: job.remoteType,
      seniority: job.seniority,
      salary: formatSalary(job),
      source: job.source?.name || job.source?.slug || "Unknown",
      applyUrl: job.applyUrl ?? job.sourceUrl ?? "",
      postedAt: formatDate(job.postedAt),
      matchScore: match?.totalScore ?? "",
      strongSignals: safeArray(match?.matchingSkills).join(", "),
      likelyGaps: safeArray(match?.missingSkills).join(", "),
      saved: job.savedBy.length > 0 ? "yes" : "no",
      applicationStatus: job.applications[0]?.status ?? "",
    }));

    const html = buildExcelHtml({
      title: `Git-a-Job ${tierConfig.label}`,
      rows,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `git-a-job-${tier}-jobs-${timestamp}.xls`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-Git-a-Job-Export-Count": String(rows.length),
        "X-Git-a-Job-Export-Limit": String(tierConfig.limit),
      },
    });
  } catch (error) {
    console.error("POST /api/jobs/export failed", error);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not export jobs.",
      },
      { status: 500 },
    );
  }
}
