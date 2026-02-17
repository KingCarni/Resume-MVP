// src/app/api/blob/upload/route.ts
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const jsonResponse = await handleUpload({
      body,
      request,

      // ✅ Your version expects: (pathname, clientPayload, multipart)
      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload: string | null,
        multipart: boolean
      ) => {
        // Optional: validate pathname
        // if (!pathname.startsWith("resume/")) throw new Error("Invalid upload path");

        return {
          allowedContentTypes: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "text/plain",
          ],

          // ✅ MUST be a string in this version
          tokenPayload: JSON.stringify({
            pathname,
            clientPayload,
            multipart,
          }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // tokenPayload will arrive as a string (or null)
        console.log("Upload completed:", blob.url, tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err: any) {
    console.error("Blob upload token error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create upload token" },
      { status: 500 }
    );
  }
}
