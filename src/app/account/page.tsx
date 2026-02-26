// src/app/account/page.tsx
import DashboardShell from "@/components/layout/DashboardShell";
import DonationRequestPanel from "@/components/account/DonationRequestPanel";
import AdminDonationRequestsPanel from "@/components/account/AdminDonationRequestsPanel";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAIL = "gitajob.com@gmail.com";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;

  return (
    <DashboardShell title="Account" subtitle="Manage your profile, credits, and settings.">
      <div className="grid gap-6">
        {/* Existing placeholder card */}
        <div className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg">
          <div className="text-black font-semibold">Account Page</div>
          <p className="mt-2 text-sm text-black/70">
            (Placeholder) We can add credit balance, purchase history, and plan status here.
          </p>
          <div className="mt-2 text-xs text-black/60">Signed in as: {email || "unknown"}</div>
        </div>

        {/* Phase 1A: Users can request help */}
        <DonationRequestPanel />

        {/* Phase 1B: Admin-only review panel */}
        {isAdmin ? <AdminDonationRequestsPanel /> : null}
      </div>
    </DashboardShell>
  );
}