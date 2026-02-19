// src/app/account/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";

export default function AccountPage() {
  return (
    <DashboardShell title="Account" subtitle="Manage your profile, credits, and settings.">
      <div className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg">
        <div className="text-black font-semibold">Account Page</div>
        <p className="mt-2 text-sm text-black/70">
          (Placeholder) We can add credit balance, purchase history, and plan status here.
        </p>
      </div>
    </DashboardShell>
  );
}
