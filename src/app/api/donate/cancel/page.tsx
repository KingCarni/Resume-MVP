// src/app/donate/cancel/page.tsx
import Link from "next/link";

export default function DonateCancelPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold">Donation canceled</h1>
      <p className="mt-3 opacity-80">
        No worries — you can donate anytime.
      </p>

      <div className="mt-8 flex gap-3">
        <Link
          href="/donate"
          className="rounded-md border px-4 py-2 text-sm transition hover:opacity-90
                     bg-white text-black border-black/10 dark:bg-zinc-900 dark:text-white dark:border-white/10"
        >
          Try again
        </Link>
        <Link
          href="/"
          className="rounded-md border px-4 py-2 text-sm transition hover:opacity-90
                     bg-white text-black border-black/10 dark:bg-zinc-900 dark:text-white dark:border-white/10"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
