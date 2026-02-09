import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // IMPORTANT: This proxy must NOT live at /api/rewrite-bullet, or it will loop.
    const url = new URL(req.url);
    url.pathname = "/api/rewrite-bullet";

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Handle JSON or plain text errors safely
    const ct = res.headers.get("content-type") || "";
    const payload = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");

    return NextResponse.json(
      payload && typeof payload === "object"
        ? payload
        : { ok: false, error: payload || "Invalid response from /api/rewrite-bullet" },
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
