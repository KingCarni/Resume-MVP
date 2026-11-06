import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listAppliedJobs, listSavedJobs } from "@/lib/jobs/queries";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : date.toISOString();
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
  try {
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
        postedAt: toIsoOrNull(item.postedAt),
        createdAt: toIsoOrNull(item.createdAt),
        savedAt: toIsoOrNull(item.savedAt),
        application: item.application
          ? {
              status: item.application.status,
              appliedAt: toIsoOrNull(item.application.appliedAt),
              updatedAt: toIsoOrNull(item.application.updatedAt),
            }
          : null,
        match: item.match
          ? {
              ...item.match,
              computedAt: toIsoOrNull(item.match.computedAt),
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/jobs/saved failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load saved jobs.",
      },
      { status: 500 },
    );
  }
}
