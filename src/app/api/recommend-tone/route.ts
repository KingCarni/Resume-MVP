// src/app/api/recommend-tone/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type ReqBody = {
  jobText: string;
  companyUrl?: string; // optional: if you add it in the UI later
};

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = (await req.json()) as Partial<ReqBody>;
    const jobText = String(body.jobText ?? "").trim();
    const companyUrl = String(body.companyUrl ?? "").trim();

    if (!jobText) {
      return NextResponse.json(
        { ok: false, error: "jobText is required" },
        { status: 400 }
      );
    }

    // Note: We are NOT browsing the web here.
    // We infer tone primarily from the job posting text.
    // If you later want “look into the company” via website, we can add a server-side fetch step.
    const prompt = `
You are helping choose a cover letter tone.

Input:
- Job posting text:
${jobText}

Optional company website (may be empty):
${companyUrl || "(none)"}

Task:
Return ONLY a short tone string (no quotes), 6-12 words max,
comma-separated adjectives, like:
"confident, concise, friendly, collaborative, results-driven"

Rules:
- Infer culture signals from the job posting language (serious vs playful, startup vs enterprise, inclusive/DEI language, etc.)
- Avoid buzzword soup.
- Keep it usable as a single "tone" field.
`.trim();

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a precise writing assistant." },
        { role: "user", content: prompt },
      ],
    });

    const tone = String(resp.choices?.[0]?.message?.content ?? "").trim();

    if (!tone) {
      return NextResponse.json(
        { ok: false, error: "No tone returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, tone });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to recommend tone" },
      { status: 500 }
    );
  }
}
