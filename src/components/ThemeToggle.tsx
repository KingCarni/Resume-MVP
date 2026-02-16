"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: don't render until we know theme client-side
  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition hover:opacity-90
                 border-black/10 bg-white text-black
                 dark:border-white/10 dark:bg-white/10 dark:text-white"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="text-base">{isDark ? "🌙" : "☀️"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
