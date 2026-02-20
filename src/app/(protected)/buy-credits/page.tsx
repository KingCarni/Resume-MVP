// src/app/(protected)/buy-credits/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import Link from "next/link";

export default function Page() {
  return (
    <DashboardShell
      title="Buy Credits"
      subtitle="Purchase credits to power AI rewrites and premium features."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <a
            href="https://git-a-job.com/donate"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-700"
          >
            Donate
          </a>

          <Link
            href="/account"
            className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm font-extrabold text-black hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Account
          </Link>
        </div>
      }
    >
      <div className="text-black dark:text-white">
        <BuyCreditsButton />
      </div>
    </DashboardShell>
  );
}