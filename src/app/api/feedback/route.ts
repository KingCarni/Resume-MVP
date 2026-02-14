import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";

function getDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_POSTGRES_URL_NON_POOLING
  );
}

export async function GET() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    // adjust table/column names if yours differ
    const r = await client.query(`
      SELECT
        SUM(CASE WHEN kind = 'interview' THEN 1 ELSE 0 END)::int AS interviews,
        SUM(CASE WHEN kind = 'job' THEN 1 ELSE 0 END)::int AS jobs,
        COUNT(*)::int AS total
      FROM feedback;
    `);

    return NextResponse.json({ ok: true, ...r.rows[0] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}

export async function POST(req: Request) {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const kind = String(body?.kind || "").toLowerCase();

  if (kind !== "interview" && kind !== "job") {
    return NextResponse.json(
      { ok: false, error: "Invalid kind. Use 'interview' or 'job'." },
      { status: 400 }
    );
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();

    await client.query(`INSERT INTO feedback (kind) VALUES ($1);`, [kind]);

    return NextResponse.json({ ok: true, inserted: kind });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
