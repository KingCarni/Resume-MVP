// src/app/feedback/page.tsx
"use client";

import React, { useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";

type Status = "idle" | "sending" | "sent" | "error";

const card =
  "rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg";

const input =
  "mt-2 w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-black placeholder:text-black/40 outline-none focus:border-white/70 focus:bg-white/70";

const btn =
  "mt-4 rounded-xl bg-black px-4 py-2 font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60";

export default function FeedbackPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          message,
          pageUrl: typeof window !== "undefined" ? window.location.href : "",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to send feedback.");
      }

      setStatus("sent");
      setEmail("");
      setMessage("");
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Something went wrong.");
    }
  }

  return (
    <DashboardShell
      title="Feedback"
      subtitle="Send a bug, idea, or issue — it goes straight to our inbox."
    >
      <div className="max-w-2xl">
        <form onSubmit={onSubmit} className={card}>
          <label className="block text-sm font-bold text-black">Your email</label>
          <input
            className={input}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            inputMode="email"
            autoComplete="email"
          />

          <label className="mt-4 block text-sm font-bold text-black">Message</label>
          <textarea
            className={`${input} resize-y`}
            placeholder="What happened? What did you expect? Any steps to reproduce?"
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />

          <button type="submit" disabled={status === "sending"} className={btn}>
            {status === "sending" ? "Sending..." : "Send feedback"}
          </button>

          {status === "sent" && (
            <p className="mt-3 text-sm text-black">
              ✅ Sent. Thanks — we’ll get back to you if needed.
            </p>
          )}

          {status === "error" && (
            <p className="mt-3 text-sm text-red-700">
              ❌ {error || "Could not send feedback."}
            </p>
          )}
        </form>
      </div>
    </DashboardShell>
  );
}
