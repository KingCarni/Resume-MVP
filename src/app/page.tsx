// src/app/page.tsx
import Link from "next/link";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-black">Git-a-Job: Toolbelt</h1>

      {!session ? (
        <div className="mt-6 max-w-xl">
          <p className="mt-2 opacity-80">
            Sign in to unlock the tools and track your credits.
          </p>

          <Link
            href="/api/auth/signin"
            className="mt-4 inline-block rounded-xl bg-black px-6 py-3 font-semibold text-white"
          >
            Sign in to start
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 opacity-80">Choose a tool:</p>

          {/* Buy credits */}
          <div className="mt-4">
            <BuyCreditsButton />
          </div>

          {/* Primary Tools */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/resume"
              className="rounded-xl border px-4 py-2 font-black transition hover:opacity-90
                         border-black/10 dark:border-white/10"
            >
              Resume Compiler
            </Link>

            <Link
              href="/cover-letter"
              className="rounded-xl border px-4 py-2 font-black transition hover:opacity-90
                         border-black/10 dark:border-white/10"
            >
              Cover Letter Generator
            </Link>
          </div>

          <div className="mt-6 text-sm opacity-70">
            Tip: Bookmark <strong>/resume</strong> or <strong>/cover-letter</strong>.
          </div>

          {/* Divider */}
          <div className="mt-12 border-t border-black/10 pt-10 dark:border-white/10" />

          {/* Support Section */}
          <section className="max-w-xl">
            <h2 className="text-xl font-bold">Support Development</h2>
            <p className="mt-2 text-sm opacity-80">
              If this tool helped you land interviews or improve your resume, you can support continued
              development.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {[5, 10, 25, 50, 100].map((amt) => (
                <Link
                  key={amt}
                  href={`/donate?amount=${amt}`}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-90
                             border-black/10 dark:border-white/10"
                >
                  Donate ${amt} CAD
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
