// src/app/api/feedback/route.ts
import { NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedbackType = "interview" | "job";

function getDbUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_POSTGRES_URL_NON_POOLING ||
    ""
  );
}

function json(
  data: any,
  init?: { status?: number; headers?: Record<string, string> }
) {
  // Same-origin Vercel usage typically doesn't need CORS headers,
  // but OPTIONS + permissive headers prevents weird preflight/tool issues.
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function parseType(body: any): FeedbackType | null {
  const raw = String(body?.type ?? "").trim().toLowerCase();
  if (raw === "interview") return "interview";
  if (raw === "job") return "job";
  return null;
}

async function withClient<T>(dbUrl: string, fn: (client: Client) => Promise<T>) {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

export async function OPTIONS() {
  // Helps if the browser/tool does a preflight request
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(req: Request) {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const type = parseType(body);
  if (!type) {
    return json(
      { ok: false, error: "Invalid type. Use { type: 'interview' } or { type: 'job' }" },
      { status: 400 }
    );
  }

  try {
    await withClient(dbUrl, async (client) => {
      await client.query("insert into app_feedback (type) values ($1)", [type]);
    });

    return json({ ok: true, inserted: type });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  }
}

export async function GET() {
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    return json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });
  }

  try {
    const rows = await withClient(dbUrl, async (client) => {
      const r = await client.query(
        `select type, count(*)::int as count
         from app_feedback
         group by type`
      );
      return r.rows ?? [];
    });

    const counts: Record<FeedbackType, number> = { interview: 0, job: 0 };

    for (const row of rows) {
      const t = String(row.type) as FeedbackType;
      const c = Number(row.count || 0);
      if (t === "interview" || t === "job") counts[t] = c;
    }

    const total = counts.interview + counts.job;

    return json({ ok: true, counts, total });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "DB error" }, { status: 500 });
  }
}
