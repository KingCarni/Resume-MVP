// src/app/(protected)/buy-credits/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import Link from "next/link";

export default function Page() {
  return (
    <DashboardShell
      title="Buy Credits"
      subtitle="Purchase credits to power AI rewrites, jobs tailoring, and premium features."
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <Link href="/jobs/saved" className="shell-secondary-btn">
            Saved Jobs
          </Link>

          <Link href="/account/donate" className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-700">
            Donate
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
