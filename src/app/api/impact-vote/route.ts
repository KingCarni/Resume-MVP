import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ImpactEvent = "interview" | "job";
type ImpactAnswer = "yes" | "no" | "notyet";

type Body = {
  event: ImpactEvent;
  answer: ImpactAnswer;
  feature?: string;  // optional: "resume" | "cover_letter" | "keywords" | ...
  template?: string; // optional: your template id string
  clientId?: string; // provided by UI (stored in localStorage)
};

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function cleanOpt(s: unknown, maxLen: number) {
  const v = String(s ?? "").trim();
  if (!v) return null;
  return v.slice(0, maxLen);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;

    const event = String(body.event || "").trim() as ImpactEvent;
    const answer = String(body.answer || "").trim() as ImpactAnswer;

    if (!["interview", "job"].includes(event)) {
      return NextResponse.json({ ok: false, error: "Invalid event." }, { status: 400 });
    }
    if (!["yes", "no", "notyet"].includes(answer)) {
      return NextResponse.json({ ok: false, error: "Invalid answer." }, { status: 400 });
    }

    // Client uniqueness (no login): hash a stable clientId from localStorage
    const clientIdRaw =
      cleanOpt(body.clientId, 200) ||
      cleanOpt(req.headers.get("x-client-id"), 200) ||
      null;

    if (!clientIdRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing clientId." },
        { status: 400 }
      );
    }

    // Mix in UA to make it slightly harder to mass-spam with same id
    const ua = req.headers.get("user-agent") || "";
    const clientHash = sha256(`${clientIdRaw}::${ua}`);

    // 30-day vote limit per (clientHash, event)
    const recent = await sql`
      select id, created_at
      from impact_votes
      where client_hash = ${clientHash}
        and event = ${event}
        and created_at > (now() - interval '30 days')
      order by created_at desc
      limit 1
    `;

    if (recent.rows.length) {
      return NextResponse.json(
        {
          ok: false,
          error: "You already answered this recently.",
          code: "RATE_LIMITED",
          nextEligibleAt: new Date(
            new Date(recent.rows[0].created_at as string).getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
        },
        { status: 429 }
      );
    }

    const feature = cleanOpt(body.feature, 48);
    const template = cleanOpt(body.template, 32);

    await sql`
      insert into impact_votes (event, answer, feature, template, client_hash)
      values (${event}, ${answer}, ${feature}, ${template}, ${clientHash})
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("impact-vote error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to record vote." },
      { status: 500 }
    );
  }
}
