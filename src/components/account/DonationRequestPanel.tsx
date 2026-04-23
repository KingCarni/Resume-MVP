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
  const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold";
  if (status === "pending") return `${base} border-amber-500/25 bg-amber-500/10 text-amber-100`;
  if (status === "approved") return `${base} border-emerald-500/25 bg-emerald-500/10 text-emerald-100`;
  if (status === "fulfilled") return `${base} border-cyan-500/25 bg-cyan-500/10 text-cyan-100`;
  return `${base} border-rose-500/25 bg-rose-500/10 text-rose-100`;
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

function panelButtonClasses(kind: "primary" | "secondary" = "secondary") {
  if (kind === "primary") {
    return "inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50";
  }
  return "inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
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

  const reasonLength = useMemo(() => normalizeText(reason, 2000).length, [reason]);
  const pendingCount = useMemo(() => rows.filter((row) => row.status === "pending").length, [rows]);

  const canSubmit = useMemo(() => {
    const creditsOk =
      Number.isFinite(requestedCredits) && requestedCredits >= 5 && requestedCredits <= 200;
    const reasonOk = reasonLength >= 10;
    return creditsOk && reasonOk && !submitting;
  }, [requestedCredits, reasonLength, submitting]);

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
        throw new Error((data as { error?: string } | null)?.error || `Failed to load requests (${res.status})`);
      }

      const list = Array.isArray(data.requests) ? data.requests : [];
      setRows(list.slice(0, 10));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load donation requests");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    load();
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
        throw new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
      }

      setOkMsg("Request submitted. You'll see updates here after admin review.");
      setReason("");

      await load();
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            Request help
          </p>
          <h4 className="mt-2 text-xl font-semibold text-white">Ask for donation credits without guesswork.</h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Requests are reviewed by an admin first. Approval and fulfillment are separate, so the status trail matters.
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loadingList}
          className={panelButtonClasses()}
          title="Reload"
        >
          {loadingList ? "Reloading..." : "Reload"}
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-100">{err}</div>
      ) : null}

      {okMsg ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{okMsg}</div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Requested credits</p>
          <div className="mt-3">
            <input
              type="number"
              min={5}
              max={200}
              value={Number.isFinite(requestedCredits) ? requestedCredits : 0}
              onChange={(e) => setRequestedCredits(Math.trunc(Number(e.target.value)))}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Min 5, max 200.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Request status</p>
              <div className="mt-2 text-3xl font-bold tracking-tight text-white">{pendingCount}</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Pending requests currently waiting for review.</p>
            </div>
            <div className="text-right text-xs leading-5 text-slate-400">
              <div>Showing up to 10</div>
              <div>Reason length: {reasonLength}/2000</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Tell us what you're applying for and why you need help (10+ characters)."
            className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
          />
          <span className="text-xs text-slate-500">Keep it short and clear. Include target role/company if useful.</span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={panelButtonClasses("primary")}
          >
            {submitting ? "Submitting..." : "Submit request"}
          </button>
          <span className="text-xs text-slate-400">You can have a limited number of pending requests. Cooldown may apply.</span>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white">Your recent requests</div>
          <div className="text-xs text-slate-400">Showing up to 10</div>
        </div>

        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/60 p-4 text-sm text-slate-400">
              {loadingList ? "Loading..." : "No requests yet."}
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">{r.requestedCredits} credits</div>
                    <span className={statusBadge(r.status)}>{r.status}</span>
                  </div>
                  <div className="text-xs text-slate-400">{fmtDate(r.createdAt)}</div>
                </div>

                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{r.reason}</div>

                {r.reviewNote ? (
                  <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 text-sm leading-6 text-slate-300">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Admin note</div>
                    <div className="mt-2 whitespace-pre-wrap">{r.reviewNote}</div>
                  </div>
                ) : null}

                <div className="mt-3 text-xs text-slate-500">Updated: {fmtDate(r.updatedAt)}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 text-xs leading-6 text-slate-500">
          Status meanings: <span className="font-semibold text-slate-300">pending</span> (waiting review), <span className="font-semibold text-slate-300">approved</span> (eligible), <span className="font-semibold text-slate-300">fulfilled</span> (credits issued), <span className="font-semibold text-slate-300">rejected</span> (not eligible).
        </div>
      </div>
    </section>
  );
}
