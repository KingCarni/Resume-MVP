// src/app/page.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import LandingHero from "@/components/landing/LandingHero";
import TrustBar from "@/components/landing/TrustBar";
import ProblemSolution from "@/components/landing/ProblemSolution";
import FeatureGrid from "@/components/landing/FeatureGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import Values from "@/components/landing/Values";
import DonateCreditsTeaser from "@/components/landing/DonateCreditsTeaser";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // ✅ Landing CTA now points to /resume (public entry tool)
  const primaryHref = "/resume";
  const primaryLabel = session ? "Go to Resume" : "Try it free";

  const secondaryHref = session ? "/resume" : "/api/auth/signin";
  const secondaryLabel = session ? "Open Resume" : "Sign in";

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-400 via-emerald-300 to-blue-500">
      {/* Top nav (marketing) */}
      <div className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="rounded-xl border border-white/40 bg-white/25 px-3 py-2 text-sm font-black text-black shadow-sm backdrop-blur hover:bg-white/35"
          >
            Git-a-Job
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={secondaryHref}
              className="rounded-xl border border-white/40 bg-white/25 px-3 py-2 text-sm font-extrabold text-black shadow-sm backdrop-blur hover:bg-white/35"
            >
              {secondaryLabel}
            </Link>

            <Link
              href={primaryHref}
              className="rounded-xl bg-black px-4 py-2 text-sm font-black text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-800 hover:shadow-lg"
            >
              {primaryLabel}
            </Link>
          </div>
        </div>
      </div>

      {/* Page content */}
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-8">
        <LandingHero
          primaryHref={primaryHref}
          primaryLabel={primaryLabel}
          secondaryHref="#how-it-works"
          secondaryLabel="See how it works"
          perkLine="New accounts start with 25 free credits."
        />

        <div className="mt-6">
          <TrustBar />
        </div>

        <div className="mt-10 grid gap-10">
          <ProblemSolution />
          <FeatureGrid />
          <HowItWorks id="how-it-works" />
          <Values />
          <DonateCreditsTeaser primaryHref={primaryHref} />
          <FinalCTA primaryHref={primaryHref} primaryLabel={primaryLabel} />
        </div>

        <div className="mt-12">
          <LandingFooter />
        </div>
      </div>
    </main>
  );
}