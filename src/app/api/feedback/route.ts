import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY);

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const to = "gitajob.com@gmail.com";
    const from = process.env.FEEDBACK_FROM_EMAIL; // e.g. "Git-a-Job Feedback <feedback@mail.gitajob.com>"
    if (!process.env.RESEND_API_KEY) return json({ ok: false, error: "Missing RESEND_API_KEY" }, 500);
    if (!from) return json({ ok: false, error: "Missing FEEDBACK_FROM_EMAIL" }, 500);

    const body = (await req.json()) as Partial<{
      email: string;
      message: string;
      pageUrl?: string;
      userAgent?: string;
      userId?: string;
    }>;

    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();
    const pageUrl = String(body.pageUrl ?? "").trim();
    const userAgent = String(body.userAgent ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!isValidEmail(email)) return json({ ok: false, error: "Please enter a valid email." }, 400);
    if (message.length < 5) return json({ ok: false, error: "Message is too short." }, 400);

    const subject = `Git-a-Job Feedback${userId ? ` (user: ${userId})` : ""}`;

    const text =
`From: ${email}
UserId: ${userId || "N/A"}
Page: ${pageUrl || "N/A"}
User-Agent: ${userAgent || "N/A"}

Message:
${message}
`;

    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      replyTo: email, // key part: lets you reply directly to the user
    });

    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
}
