// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://git-a-job.com"),
  title: {
    default: "Git-a-Job",
    template: "%s | Git-a-Job",
  },
  description:
    "ATS-aware resume and cover letter tools for tech and gaming applicants.",
  applicationName: "Git-a-Job",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    type: "website",
    url: "https://git-a-job.com",
    siteName: "Git-a-Job",
    title: "Git-a-Job",
    description:
      "ATS-aware resume and cover letter tools for tech and gaming applicants.",
    images: [
      {
        url: "/git-a-job-og.png",
        width: 1536,
        height: 1024,
        alt: "Git-a-Job",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Git-a-Job",
    description:
      "ATS-aware resume and cover letter tools for tech and gaming applicants.",
    images: ["/git-a-job-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}