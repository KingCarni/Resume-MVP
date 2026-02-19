// src/app/donate/cancel/page.tsx
import Link from "next/link";
import DashboardShell from "@/components/layout/DashboardShell";

const card =
  "rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg";

const btn =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800";

export default function DonateCancelPage() {
  return (
    <DashboardShell title="Donation canceled" subtitle="No worries — you can donate anytime.">
      <div className="max-w-3xl">
        <div className={card}>
          <div className="flex flex-wrap gap-3">
            <Link href="/donate" className={btn}>
              Try again
            </Link>
            <Link href="/" className={btn}>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
