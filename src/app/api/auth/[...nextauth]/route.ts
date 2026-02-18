// src/app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
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

 events: {
  async signIn(message) {
    const userId = message?.user?.id;
    if (!userId) return;

    try {
      const alreadyGranted = await prisma.creditsLedger.findFirst({
        where: { userId, reason: "signup_bonus" },
        select: { id: true },
      });

      if (alreadyGranted) return;

      await prisma.creditsLedger.create({
        data: {
          userId,
          delta: 25,
          reason: "signup_bonus",
        },
      });

      console.log("[auth] signup bonus granted", { userId });
    } catch (e: any) {
      console.error("[auth] signup bonus error", e);
    }
  },
},


  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
