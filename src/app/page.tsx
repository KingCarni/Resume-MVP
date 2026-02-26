// src/app/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import LandingTopBar from "@/components/landing/LandingTopBar";
import LandingHero from "@/components/landing/LandingHero";
import ProblemSolution from "@/components/landing/ProblemSolution";
import FeatureGrid from "@/components/landing/FeatureGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import Values from "@/components/landing/Values";
import DonateCreditsTeaser from "@/components/landing/DonateCreditsTeaser";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  const primaryHref = "/resume";
  const primaryLabel = session ? "Go to Resume" : "Try it free";

  // Credits (server-calculated from ledger)
  let credits = 0;
  if (session?.user?.id) {
    const agg = await prisma.creditsLedger.aggregate({
      where: { userId: session.user.id },
      _sum: { delta: true },
    });
    credits = agg._sum.delta ?? 0;
  }

  // Keep your signout callback behavior the same
  const signOutHref = "/api/auth/signout?callbackUrl=/";

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-400 via-emerald-300 to-blue-500">
      {/* ✅ App-style header when authed; simple marketing header when not */}
      <LandingTopBar
        isAuthed={!!session}
        credits={credits}
        signOutHref={signOutHref}
      />

      {/* Page content */}
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-8">
        <LandingHero
          primaryHref={primaryHref}
          primaryLabel={primaryLabel}
          secondaryHref="#how-it-works"
          secondaryLabel="See how it works"
          perkLine="New accounts start with 25 free credits."
        />

        <div className="mt-10 grid gap-10">
          <ProblemSolution />
          <FeatureGrid />
          <HowItWorks id="how-it-works" />
          <Values />
          <DonateCreditsTeaser />
          <FinalCTA primaryHref={primaryHref} primaryLabel={primaryLabel} />
        </div>

        <div className="mt-12">
          <LandingFooter />
        </div>
      </div>
    </main>
  );
}