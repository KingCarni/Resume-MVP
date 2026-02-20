// src/components/landing/LandingFooter.tsx
import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="rounded-3xl border border-white/30 bg-white/25 p-6 shadow-sm backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-black text-black/70">© {new Date().getFullYear()} Git-a-Job</div>

        <div className="flex flex-wrap gap-2 text-sm font-extrabold">
          <Link href="/toolbelt" className="rounded-xl border border-white/35 bg-white/30 px-3 py-2 text-black/80 hover:bg-white/40">
            Toolbelt
          </Link>
          <Link href="/donate" className="rounded-xl border border-white/35 bg-white/30 px-3 py-2 text-black/80 hover:bg-white/40">
            Donate
          </Link>
          {/* Add these pages when you have them */}
          {/* <Link href="/privacy" ...>Privacy</Link> */}
          {/* <Link href="/terms" ...>Terms</Link> */}
        </div>
      </div>

      <div className="mt-3 text-xs font-semibold text-black/55">
        Built to help tech &amp; gaming applicants write clearer, stronger applications.
      </div>
    </footer>
  );
}