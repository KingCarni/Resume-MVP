import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    url.pathname = "/api/rewrite-bullet";

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    return NextResponse.json(
      data ?? { ok: false, error: "Invalid JSON from /api/rewrite-bullet" },
      { status: res.status }
    );
  } catch (e: any) {
    console.error("rewriteBullet proxy error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "rewriteBullet proxy failed" },
      { status: 500 }
    );
  }
}
