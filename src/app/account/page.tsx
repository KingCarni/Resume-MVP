import { getServerSession } from "next-auth";

import AccountProfileHub from "@/components/account/AccountProfileHub";
import { authOptions } from "@/lib/auth";

const ADMIN_EMAIL = "gitajob.com@gmail.com";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email ?? "").trim().toLowerCase();
  const isAdmin = email === ADMIN_EMAIL;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AccountProfileHub
          email={String(session?.user?.email ?? "").trim()}
          isAdmin={isAdmin}
        />
      </div>
    </main>
  );
}
