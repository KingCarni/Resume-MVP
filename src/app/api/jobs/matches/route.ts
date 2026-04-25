import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveJobMatchForUser } from "@/app/api/jobs/[id]/match/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VISIBLE_MATCHES = 20;

type MatchBatchBody = {
  resumeProfileId?: unknown;
  jobIds?: unknown;
};

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

function normalizeJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_VISIBLE_MATCHES) break;
  }

  return ids;
}

export async function POST(request: Request) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as MatchBatchBody | null;
  const resumeProfileId =
    typeof body?.resumeProfileId === "string" ? body.resumeProfileId.trim() : "";
  const jobIds = normalizeJobIds(body?.jobIds);

  if (!resumeProfileId) {
    return NextResponse.json(
      { ok: false, error: "Missing resumeProfileId" },
      { status: 400 },
    );
  }

  if (!jobIds.length) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const items: Array<{
    jobId: string;
    match: {
      totalScore: number;
      explanationShort: string | null;
      matchingSkills: unknown;
      missingSkills: unknown;
      computedAt: Date;
    };
  }> = [];

  for (const jobId of jobIds) {
    const result = await resolveJobMatchForUser({
      userId,
      jobId,
      resumeProfileId,
    });

    if (!result.ok || !result.item) continue;

    items.push({
      jobId,
      match: {
        totalScore: result.item.totalScore,
        explanationShort: result.item.explanationShort,
        matchingSkills: result.item.matchingSkills,
        missingSkills: result.item.missingSkills,
        computedAt: result.item.computedAt,
      },
    });
  }

  return NextResponse.json({ ok: true, items });
}
