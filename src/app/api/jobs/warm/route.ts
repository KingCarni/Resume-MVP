import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { runJobMatchWarmupPass } from "@/lib/jobs/warmProcessor";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromSession();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resumeProfileId?: string;
    q?: string;
    remote?: string;
    location?: string;
    seniority?: string;
    minSalary?: number | null;
    targetPosition?: string;
  };

  const resumeProfileId = typeof body.resumeProfileId === "string" ? body.resumeProfileId : "";
  if (!resumeProfileId) {
    return NextResponse.json({ ok: false, error: "Missing resumeProfileId" }, { status: 400 });
  }

  const profile = await prisma.resumeProfile.findFirst({
    where: { id: resumeProfileId, userId },
    select: { id: true },
  });

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Resume profile not found" }, { status: 404 });
  }

  try {
    const result = await runJobMatchWarmupPass({
      userId,
      resumeProfileId,
      q: body.q ?? null,
      remote: body.remote ?? null,
      location: body.location ?? null,
      seniority: body.seniority ?? null,
      minSalary: typeof body.minSalary === "number" ? body.minSalary : null,
      targetPosition: typeof body.targetPosition === "string" ? body.targetPosition : null,
    });

    return NextResponse.json({
      ok: true,
      processed: result.processed,
      totalCandidates: result.totalCandidates,
      ready: result.ready,
      status: result.status,
      didWork: result.didWork,
      continueRecommended: result.continueRecommended,
      claimReason: result.claimReason ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Warmup failed",
      },
      { status: 500 },
    );
  }
}
