// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const SIGNUP_BONUS = 25;
const DAILY_LOGIN_BONUS = 10;

function startOfTodayUtc(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfTomorrowUtc(d = new Date()) {
  const today = startOfTodayUtc(d);
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

async function resolveUserId(user: any) {
  const email = String(user?.email ?? "").trim().toLowerCase();
  let userId = String(user?.id ?? "").trim();

  if (!userId && email) {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    userId = dbUser?.id ?? "";
  }

  return { userId, email };
}

async function ensureSignupBonus(userId: string, email?: string) {
  const alreadyGranted = await prisma.creditsLedger.findFirst({
    where: { userId, reason: "signup_bonus" },
    select: { id: true },
  });

  if (alreadyGranted) return;

  await prisma.creditsLedger.create({
    data: {
      userId,
      delta: SIGNUP_BONUS,
      reason: "signup_bonus",
    },
  });

  console.log("[auth] signup bonus granted", {
    userId,
    email,
    delta: SIGNUP_BONUS,
  });
}

async function ensureDailyLoginBonus(userId: string, email?: string) {
  const now = new Date();
  const todayStart = startOfTodayUtc(now);
  const tomorrowStart = startOfTomorrowUtc(now);

  const alreadyToday = await prisma.creditsLedger.findFirst({
    where: {
      userId,
      reason: "daily_login_bonus",
      createdAt: {
        gte: todayStart,
        lt: tomorrowStart,
      },
    },
    select: { id: true },
  });

  if (alreadyToday) return;

  await prisma.creditsLedger.create({
    data: {
      userId,
      delta: DAILY_LOGIN_BONUS,
      reason: "daily_login_bonus",
    },
  });

  console.log("[auth] daily login bonus granted", {
    userId,
    email,
    delta: DAILY_LOGIN_BONUS,
    dayUtc: todayStart.toISOString().slice(0, 10),
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  events: {
    async createUser(message) {
      console.log("[auth][event.createUser]", {
        id: message.user.id,
        email: message.user.email,
        name: message.user.name,
      });
    },

    async linkAccount(message) {
      console.log("[auth][event.linkAccount]", {
        userId: message.user.id,
        email: message.user.email,
        provider: message.account.provider,
        providerAccountId: message.account.providerAccountId,
      });
    },

    async signIn(message) {
      console.log("[auth][event.signIn]", {
        userId: message.user.id,
        email: message.user.email,
        isNewUser: message.isNewUser,
      });
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        (token as any).uid = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      const uid = (token as any).uid as string | undefined;
      if (session.user && uid) {
        (session.user as any).id = uid;
      }
      return session;
    },

    async signIn({ user }) {
      try {
        console.log("[auth][callback.signIn:start]", {
          userId: user?.id,
          email: user?.email,
          name: user?.name,
        });

        const { userId, email } = await resolveUserId(user);

        console.log("[auth][callback.signIn:resolved]", {
          rawUserId: user?.id,
          resolvedUserId: userId,
          email,
        });

        if (email) {
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          console.log("[auth][callback.signIn:dbUser]", dbUser);
        }

        if (!userId) {
          console.error("[auth] bonuses: missing userId", { email });
          return true;
        }

        await ensureSignupBonus(userId, email);
        await ensureDailyLoginBonus(userId, email);
      } catch (e: any) {
        console.error("[auth] bonuses error (ignored)", {
          message: e?.message,
          code: e?.code,
        });
      }

      return true;
    },
  },
};