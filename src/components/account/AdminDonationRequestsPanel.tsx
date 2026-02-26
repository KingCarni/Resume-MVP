"use client";

import React, { useEffect, useMemo, useState } from "react";
import DonationPoolCard from "@/components/admin/DonationPoolCard";

type DonationRequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

type AdminRow = {
  id: string;
  userId: string;
  requestedCredits: number;
  reason: string;
  status: DonationRequestStatus;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { email?: string | null; name?: string | null };
};

function badge(status: DonationRequestStatus) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold";
  if (status === "pending")
    return `${base} border-amber-500/30 bg-amber-200/40 text-amber-950`;
  if (status === "approved")
    return `${base} border-emerald-600/30 bg-emerald-200/40 text-emerald-950`;
  if (status === "fulfilled")
    return `${base} border-sky-600/30 bg-sky-200/40 text-sky-950`;
  return `${base} border-red-600/30 bg-red-200/40 text-red-950`;
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminDonationRequestsPanel() {
  const [status, setStatus] =
    useState<DonationRequestStatus>("pending");
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const canAct = useMemo(
    () => (id: string) => !workingId && !loading && id.length > 0,
    [workingId, loading]
  );

  async function load() {
    setLoading(true);
    setErr(null);
    setOkMsg(null);
    try {
      const res = await fetch(
        `/api/admin/donation-requests?status=${encodeURIComponent(status)}`
      );
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `Failed to load (${res.status})`);

      setRows((data.requests || []) as AdminRow[]);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(
    id: string,
    action: "approve" | "reject" | "fulfill"
  ) {
    setWorkingId(id);
    setErr(null);
    setOkMsg(null);

    try {
      const res = await fetch(
        `/api/admin/donation-requests/${id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNote }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok)
        throw new Error(data?.error || `${action} failed`);

      let msg = `${action.toUpperCase()} successful.`;

      if (typeof data?.credited === "number")
        msg += ` Credited: ${data.credited}.`;

      if (typeof data?.poolRemaining === "number")
        msg += ` Pool remaining: ${data.poolRemaining}.`;

      setOkMsg(msg);
      setReviewNote("");
      await load();
    } catch (e: any) {
      setErr(e?.message || `${action} failed`);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="grid gap-6">

      {/* 🔥 POOL CARD FIRST */}
      <DonationPoolCard />

      {/* 🔥 REQUESTS PANEL */}
      <section className="rounded-2xl border border-black/10 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-black">
              Admin — Donation Requests
            </h2>
            <div className="mt-1 text-xs text-black/60">
              Approve/reject first. Fulfill only after approval.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as DonationRequestStatus)
              }
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-extrabold"
            >
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="fulfilled">fulfilled</option>
              <option value="rejected">rejected</option>
            </select>

            <button
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-extrabold"
            >
              {loading ? "Loading…" : "Reload"}
            </button>
          </div>
        </div>

        {err && (
          <div className="mt-3 rounded-xl border border-red-300/60 bg-red-100/60 p-3 text-sm font-bold text-red-950">
            {err}
          </div>
        )}

        {okMsg && (
          <div className="mt-3 rounded-xl border border-emerald-300/60 bg-emerald-100/60 p-3 text-sm font-bold text-emerald-950">
            {okMsg}
          </div>
        )}

        <div className="mt-3">
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            placeholder="Optional admin note..."
            className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm"
          />
        </div>

        <div className="mt-4 grid gap-2">
          {rows.length === 0 ? (
            <div className="text-sm text-black/60">
              No requests for this filter.
            </div>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-black/10 bg-white p-3"
              >
                <div className="flex justify-between">
                  <div className="font-extrabold">
                    {r.requestedCredits} credits —{" "}
                    {r.user?.email || r.userId}
                  </div>
                  <div className={badge(r.status)}>
                    {r.status.toUpperCase()}
                  </div>
                </div>

                <div className="mt-2 text-sm">{r.reason}</div>

                <div className="mt-2 text-xs text-black/60">
                  Created: {fmt(r.createdAt)}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!canAct(r.id) || r.status !== "pending"}
                    onClick={() => act(r.id, "approve")}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold"
                  >
                    Approve
                  </button>

                  <button
                    disabled={!canAct(r.id) || r.status !== "pending"}
                    onClick={() => act(r.id, "reject")}
                    className="rounded-xl bg-red-400 px-3 py-2 text-xs font-extrabold"
                  >
                    Reject
                  </button>

                  <button
                    disabled={!canAct(r.id) || r.status !== "approved"}
                    onClick={() => act(r.id, "fulfill")}
                    className="rounded-xl bg-sky-400 px-3 py-2 text-xs font-extrabold"
                  >
                    Fulfill
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}