import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = { event: string; answer: string; c: string };

function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const r = await sql<Row>`
      select event, answer, count(*)::text as c
      from impact_votes
      group by event, answer
    `;

    const counts = {
      interview: { yes: 0, no: 0, notyet: 0 },
      job: { yes: 0, no: 0, notyet: 0 },
    };

    for (const row of r.rows) {
      const ev = row.event as "interview" | "job";
      const an = row.answer as "yes" | "no" | "notyet";
      if (counts[ev] && typeof (counts as any)[ev][an] === "number") {
        (counts as any)[ev][an] = toNum(row.c);
      }
    }

    const interviewTotal = counts.interview.yes + counts.interview.no + counts.interview.notyet;
    const jobTotal = counts.job.yes + counts.job.no + counts.job.notyet;

    const interviewRateDen = counts.interview.yes + counts.interview.no;
    const jobRateDen = counts.job.yes + counts.job.no;

    const interviewHelpRate =
      interviewRateDen > 0 ? Math.round((counts.interview.yes / interviewRateDen) * 100) : null;

    const jobHelpRate =
      jobRateDen > 0 ? Math.round((counts.job.yes / jobRateDen) * 100) : null;

    return NextResponse.json({
      ok: true,
      counts,
      totals: {
        interviewTotal,
        jobTotal,
        allResponses: interviewTotal + jobTotal,
      },
      helpRates: {
        interviewHelpRate, // Yes / (Yes+No)
        jobHelpRate,       // Yes / (Yes+No)
      },
    });
  } catch (e: any) {
    console.error("impact-stats error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to fetch stats." },
      { status: 500 }
    );
  }
}
