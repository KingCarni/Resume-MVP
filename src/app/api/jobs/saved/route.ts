import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listAppliedJobs, listSavedJobs } from "@/lib/jobs/queries";
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

export async function GET(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const resumeProfileId = searchParams.get("resumeProfileId");
  const view = searchParams.get("view") === "applied" ? "applied" : "saved";
  const items =
    view === "applied"
      ? await listAppliedJobs({
          userId,
          resumeProfileId,
        })
      : await listSavedJobs({
          userId,
          resumeProfileId,
        });

  return NextResponse.json({
    ok: true,
    view,
    items: items.map((item) => ({
      ...item,
      postedAt: item.postedAt ? item.postedAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      savedAt: item.savedAt ? item.savedAt.toISOString() : null,
      application: item.application
        ? {
            status: item.application.status,
            appliedAt: item.application.appliedAt.toISOString(),
            updatedAt: item.application.updatedAt.toISOString(),
          }
        : null,
      match: item.match
        ? {
            ...item.match,
            computedAt: item.match.computedAt.toISOString(),
          }
        : null,
    })),
  });
}
