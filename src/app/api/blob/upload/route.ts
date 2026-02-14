// src/app/api/blob/upload/route.ts
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();

  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname) => {
        // You can validate user auth here later if you want
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          tokenPayload: JSON.stringify({
            scope: "resume-upload",
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // optional logging
        console.log("Resume uploaded to Blob:", blob.url);
      },
    });

    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Blob upload failed" },
      { status: 400 }
    );
  }
}
