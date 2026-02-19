// src/app/page.tsx
import Link from "next/link";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const blackBtn =
  "rounded-xl bg-black px-4 py-2 font-black text-white transition-all duration-200 hover:bg-neutral-800 hover:scale-[1.02] shadow-md hover:shadow-lg";

const blackDonate =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-800 hover:scale-[1.02] shadow-md hover:shadow-lg";

const card =
  "rounded-3xl border border-white/30 bg-white/35 backdrop-blur-xl shadow-xl";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-400 via-emerald-300 to-blue-500">
      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Frosted glass shell */}
        <div className={`${card} p-6 sm:p-10`}>
          {/* Top header row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-black">
                Git-a-Job: Toolbelt
              </h1>
              <p className="mt-2 text-sm text-black/70">
                Choose a tool, manage credits, and support development.
              </p>
            </div>

            {/* Right-side quick sign-in/out area placeholder (future) */}
            <div className="text-sm text-black/60">
              {session ? (
                <span>
                  Signed in as{" "}
                  <span className="font-semibold text-black">
                    {session.user?.email ?? "user"}
                  </span>
                </span>
              ) : (
                <span>Sign in to unlock the tools and track your credits.</span>
              )}
            </div>
          </div>

          {!session ? (
            <div className="mt-8">
              <Link
                href="/api/auth/signin"
                className="inline-block rounded-xl bg-black px-6 py-3 font-semibold text-white transition hover:bg-neutral-800"
              >
                Sign in to start
              </Link>
            </div>
          ) : (
            <>
              {/* Dashboard grid */}
              <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Quick Actions / Tools */}
                <section className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg">
                  <h2 className="text-lg font-extrabold text-black">
                    Quick Actions
                  </h2>
                  <p className="mt-1 text-sm text-black/70">
                    Jump into the tools you’ll use most.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
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

                  <div className="mt-5 text-sm text-black/70">
                    Tip: Bookmark <strong className="text-black">/resume</strong>{" "}
                    or <strong className="text-black">/cover-letter</strong>.
                  </div>
                </section>

                {/* Buy Credits */}
                <section className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg">
                  <h2 className="text-lg font-extrabold text-black">
                    Buy Credits
                  </h2>
                  <p className="mt-1 text-sm text-black/70">
                    Credits power AI rewrites and premium features.
                  </p>

                  <div className="mt-5">
                    <BuyCreditsButton />
                  </div>
                </section>

                {/* Support Development */}
                <section className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg lg:col-span-2">
                  <h2 className="text-lg font-extrabold text-black">
                    Support Development
                  </h2>
                  <p className="mt-2 text-sm text-black/70">
                    If this tool helped you land interviews or improve your
                    resume, you can support continued development.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
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
              </div>

              {/* Optional bottom spacing */}
              <div className="mt-8 text-xs text-black/60">
                More tools will appear here as we expand the Toolbelt.
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
