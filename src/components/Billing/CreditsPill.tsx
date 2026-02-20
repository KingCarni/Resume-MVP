// src/components/Billing/CreditsPill.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type CreditsResponse = { ok: boolean; credits?: number; balance?: number; error?: string };

async function parseApiResponse(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

export default function CreditsPill() {
  const [credits, setCredits] = useState<number | null>(null);
  const [err, setErr] = useState<string>("");
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/credits", { method: "GET", cache: "no-store" });
      const payload = await parseApiResponse(res);

      if (!mountedRef.current) return;

      if (!res.ok || typeof payload === "string" || !payload?.ok) {
        const msg =
          typeof payload === "string"
            ? payload
            : payload?.error || "Failed to load credits";
        throw new Error(msg);
      }

      const value =
        typeof payload.credits === "number"
          ? payload.credits
          : typeof payload.balance === "number"
          ? payload.balance
          : null;

      setCredits(value);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setErr(e?.message || "Error");
      setCredits(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return (
    <div className="flex items-center gap-2">
      <div className="rounded-xl bg-black px-3 py-1.5 text-sm font-semibold text-white">
        Credits: {credits === null ? "—" : credits}
      </div>

      <button
        type="button"
        onClick={load}
        className="rounded-xl bg-black px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
        title="Refresh credits"
        aria-label="Refresh credits"
      >
        ↻
      </button>

      {err ? <span className="text-xs text-red-700 dark:text-red-300">{err}</span> : null}
    </div>
  );
}