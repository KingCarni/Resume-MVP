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

          <Link href="/account/donate" className="shell-secondary-btn">
            Donate
          </Link>
        </div>
      }
    >
      <div className="text-white">
        <BuyCreditsButton />
      </div>
    </DashboardShell>
  );
}
