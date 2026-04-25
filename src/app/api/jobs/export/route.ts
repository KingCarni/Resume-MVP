import { Prisma, RemoteType, SeniorityLevel } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { chargeCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAILS = ["gitajob.com@gmail.com"];
const EXPORT_TIERS = {
  lite: { credits: 25, limit: 500, label: "Top 500 filtered jobs" },
  plus: { credits: 50, limit: 2000, label: "Top 2,000 filtered jobs" },
  admin: { credits: 0, limit: 10000, label: "Admin full export" },
} as const;

type ExportTier = keyof typeof EXPORT_TIERS;

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

function buildExportWhere(body: ExportRequestBody, userId: string): Prisma.JobWhereInput {
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
          OR: [{ salaryMin: { gte: minSalary } }, { salaryMax: { gte: minSalary } }],
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

function formatSalary(job: { salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null }) {
  const currency = job.salaryCurrency || "";
  if (job.salaryMin == null && job.salaryMax == null) return "";
  if (job.salaryMin != null && job.salaryMax != null) return `${currency} ${job.salaryMin}-${job.salaryMax}`.trim();
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
    const requestedTier = body.tier || "lite";
    const tier: ExportTier = requestedTier in EXPORT_TIERS ? requestedTier : "lite";

    if (tier === "admin" && !isAdmin) {
      return json({ ok: false, error: "Admin export is forbidden." }, { status: 403 });
    }

    const tierConfig = EXPORT_TIERS[tier];

    if (tier !== "admin") {
      const charge = await chargeCredits({
        userId: user.id,
        cost: tierConfig.credits,
        reason: tier === "plus" ? "export_jobs_2000" : "export_jobs_500",
        eventType: "purchase",
        meta: {
          feature: "jobs_export",
          tier,
          limit: tierConfig.limit,
          label: tierConfig.label,
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

    const where = buildExportWhere(body, user.id);
    const resumeProfileId = normalizeString(body.resumeProfileId);

    const jobs = await prisma.job.findMany({
      where,
      include: {
        source: true,
        savedBy: {
          where: { userId: user.id },
          take: 1,
        },
        applications: {
          where: { userId: user.id },
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
        matches: {
          where: resumeProfileId
            ? { userId: user.id, resumeProfileId }
            : { id: "__no_resume_profile_selected__" },
          take: 1,
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: orderByForExport(body.sort),
      take: tierConfig.limit,
    });

    const rows = jobs.map((job) => {
      const match = resumeProfileId ? job.matches?.[0] : null;
      return {
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
      };
    });

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
