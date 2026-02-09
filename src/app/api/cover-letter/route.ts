// src/app/api/cover-letter/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type ReqBody = {
  jobText: string;

  // Prefer sending the actual resume text if you have it
  resumeText?: string;

  // Optional: strongest signals to ground the letter
  bullets?: string[];
  rewritePlan?: { originalBullet?: string }[];

  // Guardrails
  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];

  // Formatting
  roleTitle?: string;
  tone?: string; // e.g. "confident, concise"
  length?: "short" | "standard" | "long";
  includeSalutation?: boolean; // "Dear Hiring Manager,"
};

function normalize(s: unknown) {
  return String(s ?? "").trim();
}

function safeArray(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a.map((x) => String(x).trim()).filter(Boolean);
}

function clampText(s: string, maxChars: number) {
  const t = String(s ?? "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "…";
}

function pickBestBullets(args: {
  bullets?: string[];
  rewritePlan?: { originalBullet?: string }[];
  max?: number;
}) {
  const max = args.max ?? 6;

  const fromPlan =
    Array.isArray(args.rewritePlan) && args.rewritePlan.length
      ? args.rewritePlan
          .map((x) => String(x?.originalBullet ?? "").trim())
          .filter(Boolean)
      : [];

  const fromBullets =
    Array.isArray(args.bullets) && args.bullets.length
      ? args.bullets.map((b) => String(b ?? "").trim()).filter(Boolean)
      : [];

  // Prefer plan bullets (more aligned), then fall back to bullets
  const combined = [...fromPlan, ...fromBullets];

  // de-dupe
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const b of combined) {
    const key = b.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(b);
    if (uniq.length >= max) break;
  }

  return uniq;
}

function buildSystemPrompt() {
  return [
    "You are an expert cover letter writer for tech roles.",
    "Write a cover letter that is ATS-friendly and truthful.",
    "Hard rules:",
    "- Do NOT invent employers, products, tools, metrics, outcomes, or titles.",
    "- Do NOT mention target company/product names unless explicitly provided.",
    "- If resume evidence is missing for a claim, do not include it.",
    "- Keep it specific and grounded in the provided bullets/resume text.",
    "- Avoid fluff, clichés, and overly grand claims.",
    "",
    "Style rules:",
    "- 3–5 short paragraphs.",
    "- Use clear impact language and ownership (Led/Owned/Drove/Tested/Implemented).",
    "- No bullet lists unless the user asked (they didn't).",
  ].join("\n");
}

function buildUserPrompt(args: {
  jobText: string;
  resumeText?: string;
  bullets: string[];

  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];

  roleTitle?: string;
  tone?: string;
  length?: "short" | "standard" | "long";
  includeSalutation?: boolean;
}) {
  const blocked = [
    ...(normalize(args.targetCompany) ? [normalize(args.targetCompany)] : []),
    ...safeArray(args.targetProducts),
    ...safeArray(args.blockedTerms),
  ].filter(Boolean);

  const lengthGuide =
    args.length === "short"
      ? "Aim ~150–220 words."
      : args.length === "long"
      ? "Aim ~320–450 words."
      : "Aim ~220–320 words.";

  const salutation = args.includeSalutation !== false; // default true

  const blocks: string[] = [];

  blocks.push(`ROLE TARGET: ${normalize(args.roleTitle) || "QA Lead / QA Engineer"}`);
  if (normalize(args.sourceCompany)) blocks.push(`PAST CONTEXT COMPANY: ${normalize(args.sourceCompany)}`);

  blocks.push("");
  blocks.push("JOB POSTING (alignment only):");
  blocks.push(clampText(args.jobText, 14000));

  if (args.resumeText && normalize(args.resumeText)) {
    blocks.push("");
    blocks.push("RESUME TEXT (ground truth; do not invent beyond this):");
    blocks.push(clampText(args.resumeText, 14000));
  }

  blocks.push("");
  blocks.push("EVIDENCE BULLETS (must ground claims in these):");
  if (args.bullets.length) {
    for (const b of args.bullets) blocks.push(`- ${b}`);
  } else {
    blocks.push("(none provided — keep generic and avoid specifics)");
  }

  blocks.push("");
  blocks.push(
    `BLOCKED TERMS (must NOT appear unless already present in resume/bullets): ${
      blocked.join(", ") || "(none)"
    }`
  );

  blocks.push("");
  blocks.push(`TONE: ${normalize(args.tone) || "confident, concise, impact-driven"}`);
  blocks.push(`LENGTH: ${lengthGuide}`);
  blocks.push(`SALUTATION: ${salutation ? "Include 'Dear Hiring Manager,'" : "No salutation"}`);

  blocks.push("");
  blocks.push("OUTPUT FORMAT:");
  blocks.push("- Return ONLY the cover letter text.");
  blocks.push("- No markdown. No quotes.");
  blocks.push("- End with a professional sign-off like 'Sincerely,' then a placeholder name: 'Harley Curtis'.");

  return blocks.join("\n");
}

function looksLikeHtml(x: unknown) {
  return (
    typeof x === "string" &&
    (x.includes("<!DOCTYPE html>") || x.includes('id="__NEXT_DATA__"'))
  );
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Partial<ReqBody>;

    const jobText = normalize(body.jobText);
    const resumeText = normalize(body.resumeText);

    const bullets = pickBestBullets({
      bullets: safeArray(body.bullets),
      rewritePlan: Array.isArray(body.rewritePlan) ? body.rewritePlan : [],
      max: 6,
    });

    const sourceCompany = normalize(body.sourceCompany);
    const targetCompany = normalize(body.targetCompany);
    const targetProducts = safeArray(body.targetProducts);
    const blockedTerms = safeArray(body.blockedTerms);

    const roleTitle = normalize(body.roleTitle);
    const tone = normalize(body.tone);
    const length =
      body.length === "short" || body.length === "long" ? body.length : "standard";
    const includeSalutation =
      typeof body.includeSalutation === "boolean" ? body.includeSalutation : true;

    if (!jobText) {
      return NextResponse.json({ ok: false, error: "Missing jobText" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = buildSystemPrompt();
    const user = buildUserPrompt({
      jobText,
      resumeText: resumeText || undefined,
      bullets,
      sourceCompany,
      targetCompany,
      targetProducts,
      blockedTerms,
      roleTitle: roleTitle || undefined,
      tone: tone || undefined,
      length,
      includeSalutation,
    });

    const resp = await client.chat.completions.create({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = String(resp.choices?.[0]?.message?.content ?? "").trim();

    if (!text) {
      return NextResponse.json({ ok: false, error: "Model returned empty letter" }, { status: 500 });
    }
    if (looksLikeHtml(text)) {
      return NextResponse.json({ ok: false, error: "Model returned HTML-like output" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      coverLetter: text,
      debug: {
        model,
        bulletsUsed: bullets.length,
        length,
        includeSalutation,
      },
    });
  } catch (e: any) {
    console.error("cover-letter route error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Cover letter generation failed" },
      { status: 500 }
    );
  }
}
