// src/app/api/rewrite-bullet/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type ReqBody = {
  jobText: string;
  originalBullet: string;
  suggestedKeywords: string[];

  sourceCompany?: string;
  targetCompany?: string;
  targetProducts?: string[];
  blockedTerms?: string[];

  role?: string;
  tone?: string;
};

function normalizeArray(x: any): string[] {
  if (Array.isArray(x)) return x.map((v) => String(v).trim()).filter(Boolean);
  if (typeof x === "string") {
    return x
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function findHits(text: string, terms: string[]) {
  const t = String(text || "").toLowerCase();
  const hits: string[] = [];
  for (const raw of terms) {
    const term = String(raw || "").trim();
    if (!term) continue;
    if (t.includes(term.toLowerCase())) hits.push(term);
  }
  return uniq(hits);
}

function needsMoreInfoHeuristic(original: string, rewritten: string) {
  const o = String(original || "");
  const r = String(rewritten || "");
  // If rewrite got shorter AND lost all numbers, it might be missing specifics.
  const oHasNums = /(\d|%|\$)/.test(o);
  const rHasNums = /(\d|%|\$)/.test(r);
  if (oHasNums && !rHasNums) return true;
  // If rewrite is extremely short, likely missing context
  if (r.trim().length < 35) return true;
  return false;
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

    const jobText = String(body.jobText ?? "").trim();
    const originalBullet = String(body.originalBullet ?? "").trim();
    const suggestedKeywords = uniq(normalizeArray(body.suggestedKeywords));

    const sourceCompany = String(body.sourceCompany ?? "").trim();
    const targetCompany = String(body.targetCompany ?? "").trim();
    const targetProducts = uniq(normalizeArray(body.targetProducts));
    const blockedTerms = uniq(normalizeArray(body.blockedTerms));

    const role = String(body.role ?? "QA Lead").trim();
    const tone = String(body.tone ?? "confident, concise, impact-driven").trim();

    if (!jobText) {
      return NextResponse.json({ ok: false, error: "Missing jobText" }, { status: 400 });
    }
    if (!originalBullet) {
      return NextResponse.json({ ok: false, error: "Missing originalBullet" }, { status: 400 });
    }

    const guardrailTerms = uniq([
      // treat these as terms that should NOT be hallucinated/injected
      ...(targetCompany ? [targetCompany] : []),
      ...targetProducts,
      ...blockedTerms,
    ]);

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system = [
      `You are a senior resume writer for ${role}.`,
      `Your job: rewrite ONE resume bullet to better match the job posting while staying truthful and specific.`,
      `Tone MUST be: ${tone}.`,
      "",
      "Hard rules:",
      "- Output EXACTLY one bullet sentence (no list, no numbering, no quotes).",
      "- 16–28 words ideal. One sentence. No filler like “successfully”, “effectively”.",
      "- Start with a strong action verb.",
      "- Preserve facts. Do NOT invent tools, companies, products, metrics, or results.",
      "- Keep it ATS-friendly: clear nouns, systems, scope, outcomes.",
      "- If original bullet has numbers/metrics, keep them (or keep the same meaning).",
      ...(guardrailTerms.length
        ? [
            "",
            "Forbidden injection rule:",
            `- Do NOT mention or imply any of these terms unless they already appear in the original bullet: ${guardrailTerms.join(
              ", "
            )}`,
          ]
        : []),
      "",
      "Return strict JSON with keys:",
      `{"rewrittenBullet": string, "notes": string[], "keywordHits": string[], "blockedKeywords": string[]}`,
    ].join("\n");

    const user = [
      `JOB POSTING:\n${jobText}`,
      "",
      `ORIGINAL BULLET:\n${originalBullet}`,
      "",
      `SUGGESTED KEYWORDS (try to include naturally if truthful):\n${suggestedKeywords.join(", ") || "(none)"}`,
      "",
      sourceCompany ? `SOURCE COMPANY (context only): ${sourceCompany}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Model returned non-JSON. (Turn on server logs to inspect.)",
          debug: { raw },
        },
        { status: 500 }
      );
    }

    const rewrittenBullet = String(parsed?.rewrittenBullet ?? "").trim();
    const notes = Array.isArray(parsed?.notes) ? parsed.notes.map(String) : [];
    const keywordHits = Array.isArray(parsed?.keywordHits) ? parsed.keywordHits.map(String) : [];
    const blockedKeywords = Array.isArray(parsed?.blockedKeywords)
      ? parsed.blockedKeywords.map(String)
      : [];

    if (!rewrittenBullet) {
      return NextResponse.json(
        { ok: false, error: "Empty rewrittenBullet from model", debug: { raw } },
        { status: 500 }
      );
    }

    // Safety net: detect forbidden injections by substring match
    const originalLower = originalBullet.toLowerCase();
    const injectedBlocked = guardrailTerms.filter((t) => {
      const term = t.toLowerCase();
      if (!term) return false;
      const appearsInOriginal = originalLower.includes(term);
      const appearsInRewrite = rewrittenBullet.toLowerCase().includes(term);
      return !appearsInOriginal && appearsInRewrite;
    });

    const keywordHitAuto = findHits(rewrittenBullet, suggestedKeywords);
    const blockedHitAuto = uniq([...blockedKeywords, ...injectedBlocked]);

    const needsMoreInfo = needsMoreInfoHeuristic(originalBullet, rewrittenBullet);

    return NextResponse.json({
      ok: true,
      rewrittenBullet,
      notes: notes.length ? notes : [],
      keywordHits: uniq([...(keywordHits || []), ...keywordHitAuto]),
      blockedKeywords: blockedHitAuto,
      needsMoreInfo,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "rewrite-bullet failed" },
      { status: 500 }
    );
  }
}
