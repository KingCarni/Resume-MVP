// src/app/(protected)/buy-credits/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";

export default function Page() {
  return (
    <DashboardShell
      title="Buy Credits"
      subtitle="Purchase credits to power AI rewrites, jobs tailoring, and premium features."
      topRight={<CreditsPill />}
    >
      <div className="text-black dark:text-white">
        <BuyCreditsButton />
      </div>
    </DashboardShell>
  );
}
