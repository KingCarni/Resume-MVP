import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return json({ ok: false, error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    const bundleSessionId = cleanString(url.searchParams.get("bundleSessionId"));
    if (!bundleSessionId) {
      return json({ ok: false, error: "Missing bundleSessionId" }, 400);
    }

    const ref = `job_apply_pack:${bundleSessionId}`;

    const [chargeRow, events] = await Promise.all([
      prisma.creditsLedger.findFirst({
        where: { userId, ref },
        select: { id: true, createdAt: true },
      }),
      prisma.event.findMany({
        where: { userId, type: "analyze" },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { createdAt: true, metaJson: true },
      }),
    ]);

    let resumeConsumed = false;
    let coverLetterConsumed = false;

    for (const row of events) {
      const meta = row.metaJson as Record<string, unknown> | null;
      if (!meta || cleanString(meta.bundleSessionId) !== bundleSessionId) continue;

      const eventName = cleanString(meta.event);
      const mode = cleanString(meta.mode);

      if (!resumeConsumed && mode === "apply_pack" && eventName === "job_resume_analysis_completed") {
        resumeConsumed = true;
      }

      if (!coverLetterConsumed && (
        (mode === "apply_pack" && eventName === "job_cover_letter_completed") ||
        eventName === "job_apply_pack_completed"
      )) {
        coverLetterConsumed = true;
      }

      if (resumeConsumed && coverLetterConsumed) break;
    }

    return json({
      ok: true,
      bundleSessionId,
      charged: !!chargeRow,
      resumeIncludedAvailable: !resumeConsumed,
      coverLetterIncludedAvailable: !coverLetterConsumed,
      consumed: {
        resume: resumeConsumed,
        coverLetter: coverLetterConsumed,
      },
    });
  } catch (error: any) {
    return json({ ok: false, error: String(error?.message || error || "Failed to load apply pack status") }, 500);
  }
}
