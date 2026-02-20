// src/app/(protected)/cover-letter/page.tsx
import CoverLetterGenerator from "@/components/CoverLetterGenerator";
import DashboardShell from "@/components/layout/DashboardShell";
import CreditsPill from "@/components/Billing/CreditsPill";
import BuyCreditsButton from "@/components/Billing/BuyCreditsButton";
import Link from "next/link";

export default function Page() {
  return (
    <DashboardShell
      title="Cover Letter Generator"
      hideHeader
      topRight={
        <div className="flex items-center gap-2">
          <CreditsPill />

          <BuyCreditsButton />

          <a
            href="https://git-a-job.com/donate"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-extrabold text-black hover:bg-emerald-700"
          >
            Donate
          </a>
        </div>
      }
    >
      <div className="text-black dark:text-white">
        <CoverLetterGenerator />
      </div>
    </DashboardShell>
  );
}