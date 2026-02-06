import { NextResponse } from "next/server";
import { analyzeKeywordFit } from "@/lib/keywords";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const resumeText = String(body.resumeText ?? "");
    const jobText = String(body.jobText ?? "");

    if (!resumeText.trim() || !jobText.trim()) {
      return NextResponse.json(
        { error: "Missing resumeText or jobText" },
        { status: 400 }
      );
    }

    const analysis = analyzeKeywordFit(resumeText, jobText);

    return NextResponse.json({
      ok: true,
      ...analysis,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Failed to analyze input" },
      { status: 500 }
    );
  }
}
