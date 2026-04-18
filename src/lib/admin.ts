import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";

const DEFAULT_ADMIN_EMAILS = ["gitajob.com@gmail.com"];

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function getAdminEmails() {
  const env = String(process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((value) => normalizeEmail(value))
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...env]));
}

export function isAdminEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

export async function getAdminSession() {
  const session = await getServerSession(authOptions);
  const email = normalizeEmail(session?.user?.email);

  return {
    session,
    email,
    isAdmin: isAdminEmail(email),
  };
}
