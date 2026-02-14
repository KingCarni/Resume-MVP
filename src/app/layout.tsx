// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import Providers from "./providers";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Resume MVP",
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
                Resume MVP
              </Link>

              <div className="flex items-center gap-3">
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
