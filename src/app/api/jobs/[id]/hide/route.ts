import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
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

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type HideBody = {
  reason?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as HideBody;

  const job = await prisma.job.findFirst({
    where: { id: jobId, status: "active" },
    select: { id: true },
  });

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  await prisma.savedJob.deleteMany({
    where: {
      userId,
      jobId,
    },
  });

  const item = await prisma.hiddenJob.upsert({
    where: {
      userId_jobId: {
        userId,
        jobId,
      },
    },
    create: {
      userId,
      jobId,
      reason: body.reason?.trim() || null,
    },
    update: {
      reason: body.reason?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, item });
}
