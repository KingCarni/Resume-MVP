// src/app/api/feedback/route.ts
import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Tiny in-memory rate limit (works per server instance; good enough for MVP)
// 5 requests per IP per 10 minutes
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; windowStart: number }>();

function getIp(req: Request) {
  // Vercel / proxies may set x-forwarded-for as "ip, ip, ip"
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateLimitOk(ip: string) {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  ipHits.set(ip, entry);
  return true;
}

type ReqBody = {
  email: string;
  message: string;
  pageUrl?: string;
  userAgent?: string;
  userId?: string;
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const from = process.env.FEEDBACK_FROM_EMAIL; // e.g. "Git-a-Job Feedback <feedback@git-a-job.com>"
    const to = process.env.FEEDBACK_TO_EMAIL || "gitajob.com@gmail.com";

    if (!apiKey) return json({ ok: false, error: "Missing SENDGRID_API_KEY" }, 500);
    if (!from) return json({ ok: false, error: "Missing FEEDBACK_FROM_EMAIL" }, 500);

    // basic anti-spam guard
    const ip = getIp(req);
    if (!rateLimitOk(ip)) {
      return json({ ok: false, error: "Too many requests. Try again later." }, 429);
    }

    sgMail.setApiKey(apiKey);

    const body = (await req.json()) as Partial<ReqBody>;

    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();
    const pageUrl = String(body.pageUrl ?? "").trim();
    const userAgent = String(body.userAgent ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!isValidEmail(email)) return json({ ok: false, error: "Please enter a valid email." }, 400);
    if (message.length < 5) return json({ ok: false, error: "Message is too short." }, 400);
    if (message.length > 4000) return json({ ok: false, error: "Message is too long." }, 400);

    const subject = `Git-a-Job Feedback${userId ? ` (user: ${userId})` : ""}`;

    const text = `From: ${email}
UserId: ${userId || "N/A"}
Page: ${pageUrl || "N/A"}
User-Agent: ${userAgent || "N/A"}
IP: ${ip}

Message:
${message}
`;

    await sgMail.send({
      to,
      from, // must be verified sender / authenticated domain
      subject,
      text,
      replyTo: email, // hit reply in Gmail to respond to user
    });

    return json({ ok: true });
  } catch (e: any) {
    // SendGrid errors often have a useful response body here:
    const sgBody = e?.response?.body;
    const sgErrors = sgBody?.errors;
    const details =
      Array.isArray(sgErrors) && sgErrors.length
        ? sgErrors.map((x: any) => x?.message).filter(Boolean).join(" | ")
        : null;

    return json(
      { ok: false, error: details || e?.message || "Server error", sendgrid: details ? sgBody : undefined },
      500
    );
  }
}
