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

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") ?? "").trim();

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing resume document id" }, { status: 400 });
  }

  const existing = await prisma.document.findFirst({
    where: { id, userId, type: DocumentType.resume },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "Resume document not found" }, { status: 404 });
  }

  await prisma.document.delete({ where: { id } });

  return NextResponse.json({ ok: true, deletedId: id });
}
