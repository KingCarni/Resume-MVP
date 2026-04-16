import { DocumentType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });

  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  const latestResume = await prisma.document.findFirst({
    where: {
      userId: user.id,
      type: DocumentType.resume,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      template: true,
      text: true,
      html: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, item: latestResume });
}
