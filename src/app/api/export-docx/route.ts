import { NextResponse } from "next/server";
import htmlToDocx from "html-to-docx";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { html } = await req.json();

    if (!html) {
      return NextResponse.json({ error: "Missing HTML" }, { status: 400 });
    }

    const buffer = await htmlToDocx(html);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="cover-letter.docx"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "DOCX generation failed" },
      { status: 500 }
    );
  }
}
