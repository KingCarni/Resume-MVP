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
      {
        ok: false,
        error:
          "Missing DATABASE_URL (or DATABASE_POSTGRES_URL / DATABASE_URL_UNPOOLED / DATABASE_POSTGRES_URL_NON_POOLING)",
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

    // Matches your error log: event, answer, count from impact_votes
    const r = await client.query(
      `select event, answer, count(*)::int as c
       from impact_votes
       group by event, answer`
    );

    // Return as a nice nested object for UI
    // stats[event][answer] = count
    const stats: Record<string, Record<string, number>> = {};
    for (const row of r.rows || []) {
      const event = String(row.event ?? "");
      const answer = String(row.answer ?? "");
      const c = Number(row.c ?? 0);

      if (!event) continue;
      if (!stats[event]) stats[event] = {};
      stats[event][answer] = c;
    }

    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    console.error("impact-stats error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "DB error" },
      { status: 500 }
    );
  } finally {
    await client.end().catch(() => {});
  }
}
