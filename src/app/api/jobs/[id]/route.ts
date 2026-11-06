import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getJobDetail } from "@/lib/jobs/queries";
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

  const { id } = await context.params;
  const job = await getJobDetail(id, userId);

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    item: {
      ...job,
      isSaved: job.savedBy.length > 0,
      isHidden: job.hiddenBy.length > 0,
      savedRecord: job.savedBy[0] ?? null,
      hiddenRecord: job.hiddenBy[0] ?? null,
      applicationRecord: job.applications[0]
        ? {
            id: job.applications[0].id,
            status: job.applications[0].status,
            appliedAt: job.applications[0].appliedAt,
            createdAt: job.applications[0].createdAt,
            updatedAt: job.applications[0].updatedAt,
          }
        : null,
    },
  });
}
