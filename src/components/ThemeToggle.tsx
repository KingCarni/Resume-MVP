"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Prevent hydration mismatch by rendering nothing until mounted
    return null;
  }

  const resolved = theme === "system" ? systemTheme : theme;
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition hover:opacity-90
                 bg-white text-black border-black/10
                 dark:bg-zinc-900 dark:text-white dark:border-white/10"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="text-base">{isDark ? "🌙" : "☀️"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
