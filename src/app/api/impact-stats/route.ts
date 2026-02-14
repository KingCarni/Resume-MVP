// src/app/api/impact-stats/route.ts
import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImpactEvent = "interview" | "job";
type ImpactAnswer = "yes" | "no";

function emptyAllResponses() {
  return {
    interview: { yes: 0, no: 0 },
    job: { yes: 0, no: 0 },
  };
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
  // Covers: Vercel Postgres (Storage), Neon, and your earlier manual DATABASE_URL setup
  const candidates = [
    // Vercel Postgres (most common)
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NO_SSL,

    // Some templates / older variants
    process.env.VERCEL_POSTGRES_URL,
    process.env.VERCEL_POSTGRES_URL_NON_POOLING,

    // Your custom names
    process.env.DATABASE_URL,
    process.env.DATABASE_POSTGRES_URL,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DATABASE_POSTGRES_URL_NON_POOLING,
  ].filter(Boolean);

  return (candidates[0] as string) || "";
}

export async function GET() {
  const dbUrl = getDbUrl();

  // Always return a non-crashy shape, even if DB is missing
  if (!dbUrl) {
    return okResponse(
      {
        ok: false,
        error:
          "Missing database connection string. Set POSTGRES_URL (Vercel Storage) or DATABASE_URL.",
        counts: { interview: 0, job: 0 },
        allResponses: emptyAllResponses(),
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

    const r = await client.query(
      `select event, answer, count(*)::int as c
       from impact_votes
       group by event, answer`
    );

    const allResponses = emptyAllResponses();

    for (const row of r.rows || []) {
      const event = String(row.event || "");
      const answer = String(row.answer || "");
      const c = Number(row.c || 0);

      if ((event === "interview" || event === "job") && (answer === "yes" || answer === "no")) {
        allResponses[event as ImpactEvent][answer as ImpactAnswer] = c;
      }
    }

    const counts = {
      interview: allResponses.interview.yes,
      job: allResponses.job.yes,
    };

    return okResponse({ ok: true, counts, allResponses });
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");

    // Table missing -> return zeros so UI never crashes
    const relationMissing =
      code === "42P01" ||
      (msg.toLowerCase().includes("relation") && msg.toLowerCase().includes("does not exist"));

    console.error("impact-stats error:", e);

    if (relationMissing) {
      return okResponse({
        ok: true,
        counts: { interview: 0, job: 0 },
        allResponses: emptyAllResponses(),
      });
    }

    return okResponse(
      {
        ok: false,
        error: msg || "DB error",
        code: code || undefined,
        counts: { interview: 0, job: 0 },
        allResponses: emptyAllResponses(),
      },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => {});
  }
}
