// src/app/api/export-docx/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "DOCX export is disabled. This deployment supports PDF export only.",
    },
    { status: 400 }
  );
}
