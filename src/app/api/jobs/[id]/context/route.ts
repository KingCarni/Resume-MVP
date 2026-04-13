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

export async function GET(_request: Request, context: RouteContext) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await context.params;

  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      status: "active",
    },
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      remoteType: true,
      seniority: true,
      employmentType: true,
      applyUrl: true,
      sourceUrl: true,
      description: true,
      requirementsText: true,
      responsibilitiesText: true,
      postedAt: true,
    },
  });

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  const jobContextText = [
    `${job.title} at ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    `Remote type: ${job.remoteType}`,
    `Seniority: ${job.seniority}`,
    `Employment type: ${job.employmentType}`,
    job.description || null,
    job.requirementsText || null,
    job.responsibilitiesText || null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return NextResponse.json({
    ok: true,
    item: {
      ...job,
      jobContextText,
    },
  });
}
