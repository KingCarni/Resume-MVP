// src/app/donate/cancel/page.tsx
import Link from "next/link";

export default function DonateCancelPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-black">Donation canceled</h1>

      <p className="mt-3 opacity-80">No worries — you can donate anytime.</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/donate"
          className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-90
                     border-black/10 dark:border-white/10"
        >
          Try again
        </Link>

        <Link
          href="/"
          className="rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-90
                     border-black/10 dark:border-white/10"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
