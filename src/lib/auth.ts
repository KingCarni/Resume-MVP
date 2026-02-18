// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

const SIGNUP_BONUS = 25;

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

  callbacks: {
    // Put userId into JWT
    async jwt({ token, user }) {
      if (user?.id) {
        (token as any).uid = user.id;
      }
      return token;
    },

    // Expose userId on session.user.id
    async session({ session, token }) {
      const uid = (token as any).uid as string | undefined;
      if (session.user && uid) {
        (session.user as any).id = uid;
      }
      return session;
    },

    // Grant signup bonus (safe + idempotent)
    async signIn({ user }) {
      try {
        const email = String(user?.email ?? "")
          .trim()
          .toLowerCase();

        // Prefer user.id; if missing, lookup by email
        let userId = String((user as any)?.id ?? "").trim();

        if (!userId && email) {
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          userId = dbUser?.id ?? "";
        }

        // Never block login if we can't resolve userId
        if (!userId) {
          console.error("[auth] signup bonus: missing userId", { email });
          return true;
        }

        const alreadyGranted = await prisma.creditsLedger.findFirst({
          where: { userId, reason: "signup_bonus" },
          select: { id: true },
        });

        if (!alreadyGranted) {
          await prisma.creditsLedger.create({
            data: {
              userId,
              delta: SIGNUP_BONUS,
              reason: "signup_bonus",
            },
          });

          console.log("[auth] signup bonus granted", { userId, email });
        }
      } catch (e: any) {
        console.error("[auth] signup bonus error (ignored)", {
          message: e?.message,
          code: e?.code,
        });
      }

      return true;
    },
  },
};
