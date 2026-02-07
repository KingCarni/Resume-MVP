import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";
import { extractResumeBullets } from "@/lib/bullets";
import { suggestKeywordsForBullets } from "@/lib/bullet_suggestions";
import { buildRewritePlan } from "@/lib/rewrite_plan";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const resumeText = String(body.resumeText ?? "");
    const jobText = String(body.jobText ?? body.jobPostingText ?? "");

    if (!resumeText.trim() || !jobText.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing resumeText or jobText" },
        { status: 400 }
      );
    }

    const analysis = analyzeKeywordFit(resumeText, jobText);

    const bullets = extractResumeBullets(resumeText);

    const { bulletSuggestions, weakBullets } = suggestKeywordsForBullets(
      bullets,
      jobText,
      analysis.missingKeywords
    );

    const rewritePlan = buildRewritePlan(bulletSuggestions);

    return NextResponse.json({
      ok: true,
      ...analysis,
      bullets,
      bulletSuggestions,
      weakBullets,
      rewritePlan,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to analyze input" },
      { status: 500 }
    );
  }
}
