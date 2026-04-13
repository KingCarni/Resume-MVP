import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BOOT_TAG = "jobs-analytics-v1";

type AnalyticsBody = {
  category?: string;
  event?: string;
  createdAt?: string;
  path?: string;
  jobId?: string;
  resumeProfileId?: string;
  company?: string;
  jobTitle?: string;
  sourceSlug?: string;
  route?: string;
  mode?: string;
  matchScore?: number | null;
  page?: number;
  sort?: string;
  search?: string;
  remote?: string;
  seniority?: string;
  location?: string;
  minSalary?: string;
  totalJobs?: number;
  meta?: Record<string, unknown>;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function toSafeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await req.json()) as AnalyticsBody;
    const eventName = String(body?.event || "").trim();

    if (!eventName) {
      return json({ ok: false, error: "Missing event" }, 400);
    }

    const metaJson = toSafeJson({
      tag: BOOT_TAG,
      category: body?.category || "jobs",
      event: eventName,
      createdAtClient: body?.createdAt || null,
      path: body?.path || null,
      jobId: body?.jobId || null,
      resumeProfileId: body?.resumeProfileId || null,
      company: body?.company || null,
      jobTitle: body?.jobTitle || null,
      sourceSlug: body?.sourceSlug || null,
      route: body?.route || null,
      mode: body?.mode || null,
      matchScore: body?.matchScore ?? null,
      page: body?.page ?? null,
      sort: body?.sort || null,
      search: body?.search || null,
      remote: body?.remote || null,
      seniority: body?.seniority || null,
      location: body?.location || null,
      minSalary: body?.minSalary || null,
      totalJobs: body?.totalJobs ?? null,
      meta: body?.meta ?? null,
    });

    const saved = await prisma.event.create({
      data: {
        userId,
        type: "analyze",
        metaJson,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    return json({
      ok: true,
      saved: true,
      eventId: saved.id,
      createdAt: saved.createdAt,
      route: "src/app/api/analytics/route.ts",
      tag: BOOT_TAG,
    });
  } catch (e: any) {
    const message = e?.message ? String(e.message) : "Failed to save analytics";
    console.error("analytics route error:", e);
    return json(
      {
        ok: false,
        error: message,
        route: "src/app/api/analytics/route.ts",
        tag: BOOT_TAG,
      },
      500
    );
  }
}

export async function GET() {
  return json({
    ok: true,
    route: "src/app/api/analytics/route.ts",
    tag: BOOT_TAG,
    note: "POST only for event writes",
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
