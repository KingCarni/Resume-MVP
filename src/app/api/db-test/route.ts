import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";

export async function GET() {
  const dbUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_POSTGRES_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_POSTGRES_URL_NON_POOLING;

if (!dbUrl) {
  throw new Error("Missing database connection string");
}


  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query("select now() as now");
    return NextResponse.json({ ok: true, now: r.rows?.[0]?.now ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
