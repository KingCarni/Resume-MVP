// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNUP_BONUS = 25;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      // Never block sign-in because of a credits write
      try {
        const userId = String(user?.id ?? "").trim();
        if (!userId) return true;

        // Grant once: if user already has a signup_bonus entry, do nothing
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
          console.log("[auth] signup bonus granted", { userId });
        }
      } catch (e: any) {
        console.error("[auth] signup bonus error (ignored)", {
          message: e?.message,
          code: e?.code,
        });
        // IMPORTANT: allow sign-in even if bonus fails
      }

      return true;
    },
  },

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
