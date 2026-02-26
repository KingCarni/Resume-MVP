import DashboardShell from "@/components/layout/DashboardShell";
import DonateCreditsPanel from "@/components/account/DonateCreditsPanel";

export default function DonateCreditsPage() {
  return (
    <DashboardShell
      title="Donate Credits"
      subtitle="Donate paid credits to the community pool."
    >
      <DonateCreditsPanel />
    </DashboardShell>
  );
}