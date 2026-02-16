"use client";

import React, { useState } from "react";
import Link from "next/link";

type Status = "idle" | "sending" | "sent" | "error";

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
          // later: userId, name, plan, template, etc.
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
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6">
        <Link className="text-sm underline opacity-80 hover:opacity-100" href="/">
          ← Back
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">Feedback</h1>
        <p className="mt-2 text-sm opacity-80">
          Send a bug, idea, or issue — it goes straight to our inbox.
        </p>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border p-5 shadow-sm">
        <label className="block text-sm font-medium">Your email</label>
        <input
          className="mt-2 w-full rounded-xl border px-3 py-2"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          inputMode="email"
          autoComplete="email"
        />

        <label className="mt-4 block text-sm font-medium">Message</label>
        <textarea
          className="mt-2 w-full resize-y rounded-xl border px-3 py-2"
          placeholder="What happened? What did you expect? Any steps to reproduce?"
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />

        <button
          type="submit"
          disabled={status === "sending"}
          className="mt-4 rounded-xl border px-4 py-2 font-medium hover:opacity-90 disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Send feedback"}
        </button>

        {status === "sent" && (
          <p className="mt-3 text-sm">
            ✅ Sent. Thanks — we’ll get back to you if needed.
          </p>
        )}

        {status === "error" && (
          <p className="mt-3 text-sm text-red-600">
            ❌ {error || "Could not send feedback."}
          </p>
        )}
      </form>
    </main>
  );
}
