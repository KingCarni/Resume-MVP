import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listJobs } from "@/lib/jobs/queries";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseNullableInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const resumeProfileId = searchParams.get("resumeProfileId");
  const q = searchParams.get("q");
  const remote = searchParams.get("remote");
  const location = searchParams.get("location");
  const seniority = searchParams.get("seniority");
  const minSalary = parseNullableInt(searchParams.get("minSalary"));
  const targetPosition = searchParams.get("targetPosition");
  const sort =
    (searchParams.get("sort") as "match" | "newest" | "salary" | null) ??
    "match";
  const page = parseNullableInt(searchParams.get("page"));
  const pageSize = parseNullableInt(searchParams.get("pageSize"));

  const result = await listJobs({
    userId,
    resumeProfileId,
    q,
    remote,
    location,
    seniority,
    minSalary,
    targetPosition,
    sort,
    page,
    pageSize,
  });

  return NextResponse.json({ ok: true, ...result });
}
