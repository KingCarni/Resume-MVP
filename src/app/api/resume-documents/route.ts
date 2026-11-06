import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getUserIdFromSession() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email;

  if (!userEmail) return null;

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function DELETE(request: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id || "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: {
      id,
      userId,
      type: DocumentType.resume,
    },
    select: { id: true },
  });

  if (!document) {
    return NextResponse.json({ ok: false, error: "Resume not found." }, { status: 404 });
  }

  await prisma.resumeProfile.updateMany({
    where: {
      userId,
      sourceDocumentId: id,
    },
    data: {
      sourceDocumentId: null,
    },
  });

  await prisma.document.delete({
    where: { id },
  });

  return NextResponse.json({ ok: true, deletedId: id });
}
