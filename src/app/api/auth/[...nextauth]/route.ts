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

  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    // ✅ Put userId into the JWT so we can expose it on session.user.id
    async jwt({ token, user }) {
      if (user?.id) {
        (token as any).uid = user.id;
      }
      return token;
    },

    // ✅ Expose session.user.id (fixes “logged in but redirected” bugs)
    async session({ session, token }) {
      const uid = (token as any).uid as string | undefined;
      if (session.user && uid) {
        (session.user as any).id = uid;
      }
      return session;
    },

    // ✅ Grant signup bonus safely, but NEVER block sign-in
    async signIn({ user }) {
      try {
        const userId = String(user?.id ?? "").trim();
        if (!userId) return true;

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
        // Never block login because of credits
      }

      return true;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
