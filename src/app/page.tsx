// src/app/page.tsx
import Link from "next/link";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const blackBtn =
  "rounded-xl bg-black px-4 py-2 font-black text-white transition-all duration-200 hover:bg-neutral-800 hover:scale-[1.02] shadow-md hover:shadow-lg";

const blackDonate =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-800 hover:scale-[1.02] shadow-md hover:shadow-lg";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-500 via-emerald-400 to-blue-600 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-black tracking-tight">
          Git-a-Job: Toolbelt
        </h1>

        {!session ? (
          <div className="mt-6 max-w-xl">
            <p className="mt-2 opacity-90">
              Sign in to unlock the tools and track your credits.
            </p>

            <Link
              href="/api/auth/signin"
              className="mt-4 inline-block rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-neutral-800 transition"
            >
              Sign in to start
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 opacity-90">Choose a tool:</p>

            {/* Primary Tools */}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/resume" className={blackBtn}>
                Resume Compiler
              </Link>

              <Link href="/cover-letter" className={blackBtn}>
                Cover Letter Generator
              </Link>

              <Link href="/account" className={blackBtn}>
                Account
              </Link>
            </div>

            <div className="mt-6 text-sm opacity-90">
              Tip: Bookmark <strong>/resume</strong> or{" "}
              <strong>/cover-letter</strong>.
            </div>

            {/* Divider */}
            <div className="mt-14 border-t border-white/20 pt-10" />

            {/* Support Section */}
            <section className="max-w-xl">
              <h2 className="text-xl font-bold">Support Development</h2>
              <p className="mt-2 text-sm opacity-90">
                If this tool helped you land interviews or improve your resume,
                you can support continued development.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {[5, 10, 25, 50, 100].map((amt) => (
                  <Link
                    key={amt}
                    href={`/donate?amount=${amt}`}
                    className={blackDonate}
                  >
                    Donate ${amt} CAD
                  </Link>
                ))}
              </div>
            </section>

            {/* Buy credits */}
            <div className="mt-12 max-w-xl">
              <BuyCreditsButton />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
