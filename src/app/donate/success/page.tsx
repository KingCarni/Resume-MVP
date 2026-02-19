// src/app/donate/success/page.tsx
import Link from "next/link";
import DashboardShell from "@/components/layout/DashboardShell";

const card =
  "rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg";

const btn =
  "rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800";

export default function DonateSuccessPage() {
  return (
    <DashboardShell title="Thank you! ❤️" subtitle="Your donation helps keep Git-a-Job moving forward.">
      <div className="max-w-3xl">
        <div className={card}>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className={btn}>
              Back to Home
            </Link>
            <Link href="/resume" className={btn}>
              Go to Resume Compiler
            </Link>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
