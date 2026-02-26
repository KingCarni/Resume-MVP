// src/components/account/DonationRequestPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DonationRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

type DonationRequestRow = {
  id: string;
  requestedCredits: number;
  reason: string;
  status: DonationRequestStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiListResp =
  | { ok: true; requests: DonationRequestRow[] }
  | { ok: false; error?: string };

type ApiCreateResp =
  | { ok: true; request: DonationRequestRow }
  | { ok: false; error?: string };

function statusBadge(status: DonationRequestStatus) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-extrabold border shadow-sm";
  if (status === "pending")
    return `${base} border-amber-300/70 bg-amber-100/70 text-amber-900`;
  if (status === "approved")
    return `${base} border-emerald-300/70 bg-emerald-100/70 text-emerald-900`;
  if (status === "fulfilled")
    return `${base} border-sky-300/70 bg-sky-100/70 text-sky-900`;
  return `${base} border-red-300/70 bg-red-100/70 text-red-900`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeText(s: unknown, max = 2000) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, max);
}

export default function DonationRequestPanel() {
  const router = useRouter();

  const [requestedCredits, setRequestedCredits] = useState<number>(25);
  const [reason, setReason] = useState<string>("");

  const [rows, setRows] = useState<DonationRequestRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const creditsOk =
      Number.isFinite(requestedCredits) &&
      requestedCredits >= 5 &&
      requestedCredits <= 200;

    const reasonOk = normalizeText(reason, 2000).length >= 10;

    return creditsOk && reasonOk && !submitting;
  }, [requestedCredits, reason, submitting]);

  async function load() {
    setLoadingList(true);
    setErr(null);

    try {
      const res = await fetch("/api/donation-requests", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await res.json().catch(() => null)) as ApiListResp | null;

      if (!res.ok || !data || !data.ok) {
        throw new Error((data as any)?.error || `Failed to load requests (${res.status})`);
      }

      const list = Array.isArray(data.requests) ? data.requests : [];
      setRows(list.slice(0, 10));
    } catch (e: any) {
      setErr(e?.message || "Failed to load donation requests");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    setOkMsg(null);

    try {
      const payload = {
        requestedCredits: Math.trunc(Number(requestedCredits)),
        reason: normalizeText(reason, 2000),
      };

      const res = await fetch("/api/donation-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiCreateResp | null;

      if (!res.ok || !data || !data.ok) {
        throw new Error((data as any)?.error || `Request failed (${res.status})`);
      }

      setOkMsg("Request submitted. You’ll see updates here after admin review.");
      setReason("");

      await load();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-3xl border border-white/35 bg-white/45 backdrop-blur-xl p-6 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-black text-lg font-extrabold">
            Request Help (Donation Credits)
          </div>
          <div className="mt-1 text-sm text-black/70">
            This sends a request to be reviewed by an admin. Approval and fulfillment are separate steps.
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loadingList}
          className="rounded-xl bg-black px-4 py-2 text-sm font-extrabold text-white shadow-md transition-all hover:scale-[1.02] hover:bg-neutral-800 disabled:opacity-50"
          title="Reload"
        >
          {loadingList ? "Reloading…" : "Reload"}
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-red-300/60 bg-red-100/70 p-3 text-sm text-red-950">
          <div className="font-extrabold">Error</div>
          <div className="mt-1 whitespace-pre-wrap opacity-90">{err}</div>
        </div>
      ) : null}

      {okMsg ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/60 bg-emerald-100/70 p-3 text-sm text-emerald-950">
          <div className="font-extrabold">Success</div>
          <div className="mt-1 opacity-90">{okMsg}</div>
        </div>
      ) : null}

      {/* Form */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="grid gap-1.5">
          <div className="text-xs font-extrabold text-black/70">Requested credits</div>
          <input
            type="number"
            min={5}
            max={200}
            value={Number.isFinite(requestedCredits) ? requestedCredits : 0}
            onChange={(e) => setRequestedCredits(Math.trunc(Number(e.target.value)))}
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20"
          />
          <div className="text-xs text-black/60">Min 5, max 200.</div>
        </label>

        <label className="grid gap-1.5 lg:col-span-2">
          <div className="text-xs font-extrabold text-black/70">Reason</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Tell us what you’re applying for and why you need help (10+ characters)."
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:border-black/20"
          />
          <div className="text-xs text-black/60">
            Keep it short and clear. Include target role/company if you want.
          </div>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-black shadow-md transition-all duration-200 hover:bg-emerald-600 hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>

        <div className="text-xs font-extrabold text-black/60">
          You can have a limited number of pending requests. Cooldown may apply.
        </div>
      </div>

      {/* Recent requests */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold text-black/80">Your recent requests</div>
          <div className="text-xs text-black/60">Showing up to 10</div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-black/10 bg-white">
          {rows.length === 0 ? (
            <div className="p-4 text-sm text-black/70">
              {loadingList ? "Loading…" : "No requests yet."}
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {rows.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-extrabold text-black">
                        {r.requestedCredits} credits
                      </div>
                      <span className={statusBadge(r.status)}>{r.status}</span>
                    </div>

                    <div className="text-xs text-black/60">
                      {fmtDate(r.createdAt)}
                    </div>
                  </div>

                  <div className="mt-2 whitespace-pre-wrap text-sm text-black/80">
                    {r.reason}
                  </div>

                  {r.reviewNote ? (
                    <div className="mt-3 rounded-xl border border-black/10 bg-black/5 p-3 text-sm text-black/80">
                      <div className="text-xs font-extrabold text-black/60">Admin note</div>
                      <div className="mt-1 whitespace-pre-wrap">{r.reviewNote}</div>
                    </div>
                  ) : null}

                  <div className="mt-2 text-xs text-black/60">
                    Updated: {fmtDate(r.updatedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 text-xs text-black/60">
          Status meanings: <span className="font-bold">pending</span> (waiting review),{" "}
          <span className="font-bold">approved</span> (eligible),{" "}
          <span className="font-bold">fulfilled</span> (credits issued),{" "}
          <span className="font-bold">rejected</span> (not eligible).
        </div>
      </div>
    </div>
  );
}