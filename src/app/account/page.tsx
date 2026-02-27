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
    <DashboardShell
      title="Account"
      subtitle="Manage your credits and requests."
    >
      {/* Subtle signed-in indicator */}
      <div className="mb-6 text-right text-xs font-semibold text-black/60">
        Signed in as: {email || "unknown"}
      </div>

      <div className="grid gap-6">
        {/* User Donation Request Panel */}
        <DonationRequestPanel />

        {/* Admin Review Panel */}
        {isAdmin ? <AdminDonationRequestsPanel /> : null}
      </div>
    </DashboardShell>
  );
}