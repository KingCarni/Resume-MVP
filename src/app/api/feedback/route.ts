// src/app/api/feedback/route.ts
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

export async function POST(req: Request) {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const typeRaw = String(body?.type ?? "").trim().toLowerCase();
  const type = typeRaw === "job" ? "job" : typeRaw === "interview" ? "interview" : "";

  if (!type) {
    return NextResponse.json(
      { ok: false, error: "Invalid type. Use { type: 'interview' } or { type: 'job' }" },
      { status: 400 }
    );
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query("insert into app_feedback (type) values ($1)", [type]);
    return NextResponse.json({ ok: true, inserted: type });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}

export async function GET() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const r = await client.query(
      `select type, count(*)::int as count
       from app_feedback
       group by type`
    );

    const counts = { interview: 0, job: 0 } as { interview: number; job: number };
    for (const row of r.rows || []) {
      const t = String(row.type);
      const c = Number(row.count || 0);
      if (t === "interview") counts.interview = c;
      if (t === "job") counts.job = c;
    }

    return NextResponse.json({ ok: true, counts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
