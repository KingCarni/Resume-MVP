// src/app/api/impact-stats/route.ts
import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImpactEvent = "interview" | "job";
type ImpactAnswer = "yes" | "no" | "notyet";

type StatsPayload = {
  ok: boolean;
  error?: string;
  counts: {
    interview: { yes: number; no: number; notyet: number };
    job: { yes: number; no: number; notyet: number };
  };
  totals: {
    interviewTotal: number;
    jobTotal: number;
    allResponses: number;
  };
  helpRates: {
    interviewHelpRate: number | null;
    jobHelpRate: number | null;
  };
};

function emptyCounts(): StatsPayload["counts"] {
  return {
    interview: { yes: 0, no: 0, notyet: 0 },
    job: { yes: 0, no: 0, notyet: 0 },
  };
}

function calcHelpRate(yes: number, no: number) {
  const denom = yes + no;
  if (denom <= 0) return null;
  return Math.round((yes / denom) * 100);
}

function okResponse(payload: any, init?: ResponseInit) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(init?.headers || {}),
    },
  });
}

function getDbUrl() {
  const candidates = [
    // Vercel Postgres
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NO_SSL,

    // Older variants
    process.env.VERCEL_POSTGRES_URL,
    process.env.VERCEL_POSTGRES_URL_NON_POOLING,

    // Custom/manual
    process.env.DATABASE_URL,
    process.env.DATABASE_POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DATABASE_POSTGRES_URL_NON_POOLING,
  ].filter(Boolean);

  return (candidates[0] as string) || "";
}

export async function GET() {
  const dbUrl = getDbUrl();

  const base: StatsPayload = {
    ok: true,
    counts: emptyCounts(),
    totals: { interviewTotal: 0, jobTotal: 0, allResponses: 0 },
    helpRates: { interviewHelpRate: null, jobHelpRate: null },
  };

  if (!dbUrl) {
    return okResponse(
      {
        ...base,
        ok: false,
        error:
          "Missing database connection string. Set POSTGRES_URL (Vercel Storage) or DATABASE_URL.",
      },
      { status: 500 }
    );
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // Count ALL responses by event + answer (including notyet)
    const r = await client.query(
      `select event, answer, count(*)::int as c
       from impact_votes
       group by event, answer`
    );

    const counts = emptyCounts();

    for (const row of r.rows || []) {
      const event = String(row.event || "") as ImpactEvent;
      const answer = String(row.answer || "") as ImpactAnswer;
      const c = Number(row.c || 0);

      if (
        (event === "interview" || event === "job") &&
        (answer === "yes" || answer === "no" || answer === "notyet")
      ) {
        counts[event][answer] = c;
      }
    }

    const interviewTotal = counts.interview.yes + counts.interview.no + counts.interview.notyet;
    const jobTotal = counts.job.yes + counts.job.no + counts.job.notyet;

    const payload: StatsPayload = {
      ok: true,
      counts,
      totals: {
        interviewTotal,
        jobTotal,
        allResponses: interviewTotal + jobTotal,
      },
      helpRates: {
        interviewHelpRate: calcHelpRate(counts.interview.yes, counts.interview.no),
        jobHelpRate: calcHelpRate(counts.job.yes, counts.job.no),
      },
    };

    return okResponse(payload);
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");

    const relationMissing =
      code === "42P01" ||
      (msg.toLowerCase().includes("relation") && msg.toLowerCase().includes("does not exist"));

    console.error("impact-stats error:", e);

    if (relationMissing) {
      // Table missing -> safe zeros
      return okResponse(base);
    }

    return okResponse(
      {
        ...base,
        ok: false,
        error: msg || "DB error",
      },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => {});
  }
}
