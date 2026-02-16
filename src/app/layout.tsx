// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import Providers from "./providers";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Git-a-Job",
  description: "AI-Powered resume analysis MVP",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <header className="border-b border-black/10 dark:border-white/10">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="font-semibold">
                Git-a-Job
              </Link>

              <div className="flex items-center gap-3">
                {/* Feedback */}
                <Link
                  href="/feedback"
                  className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-bold text-black
                             shadow-sm transition hover:bg-black/5 active:scale-[0.98]
                             dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  Feedback
                </Link>

                {/* Theme toggle (if you want it visible in header) */}
                <ThemeToggle />

                {/* Donate */}
                <Link
                  href="/donate"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white
                             shadow-sm transition hover:bg-emerald-500 active:scale-[0.98]"
                >
                  Donate
                </Link>
              </div>
            </div>
          </header>

          {children}
        </Providers>
      </body>
    </html>
  );
}
