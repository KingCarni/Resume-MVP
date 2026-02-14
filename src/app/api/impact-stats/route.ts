// src/app/api/impact-stats/route.ts
import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
    ""
  );
}

export async function GET() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing DATABASE_URL (Neon/Vercel Storage env var)" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  const client = new Client({
    connectionString: dbUrl,
    // Neon/Vercel Postgres typically requires SSL; this avoids cert issues
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const r = await client.query(
      `select event, count(*)::int as c
       from impact_votes
       where answer = 'yes'
       group by event`
    );

    const counts = { interview: 0, job: 0 };

    for (const row of r.rows || []) {
      const e = String(row.event || "");
      const c = Number(row.c || 0);
      if (e === "interview") counts.interview = c;
      if (e === "job") counts.job = c;
    }

    return NextResponse.json(
      { ok: true, counts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    const msg = String(e?.message || "");
    const code = String(e?.code || "");

    const relationMissing =
      code === "42P01" ||
      (msg.toLowerCase().includes("relation") && msg.toLowerCase().includes("does not exist"));

    console.error("impact-stats error:", e);

    if (relationMissing) {
      return NextResponse.json(
        { ok: true, counts: { interview: 0, job: 0 } },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: false, error: msg || "DB error", code: code || undefined },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    await client.end().catch(() => {});
  }
}
