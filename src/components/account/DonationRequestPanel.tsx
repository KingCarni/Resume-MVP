"use client";

import * as React from "react";

type DonationRequest = {
  id: string;
  amount: number;
  reason: string | null;
  status: "pending" | "approved" | "fulfilled" | "rejected";
  createdAt: string;
};

type DonationRequestPanelProps = {
  requests: DonationRequest[];
  requestedCredits: number;
  setRequestedCredits: (value: number) => void;
  requestReason: string;
  setRequestReason: (value: string) => void;
  requestBusy: boolean;
  requestError: string | null;
  requestSuccess: string | null;
  onReload: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
};

function formatRequestStatus(requests: DonationRequest[]): string {
  if (!requests.length) return "No requests made";
  const latest = requests[0];
  switch (latest.status) {
    case "pending":
      return "Waiting for response";
    case "approved":
      return "Approved";
    case "fulfilled":
      return "Approved";
    case "rejected":
      return "Denied";
    default:
      return "No requests made";
  }
}

export default function DonationRequestPanel({
  requests,
  requestedCredits,
  setRequestedCredits,
  requestReason,
  setRequestReason,
  requestBusy,
  requestError,
  requestSuccess,
  onReload,
  onSubmit,
}: DonationRequestPanelProps) {
  const [recentOpen, setRecentOpen] = React.useState(false);
  const latestStatus = formatRequestStatus(requests);

  return (
    <section className="rounded-[28px] border border-cyan-500/30 bg-slate-950/80 p-6 shadow-[0_0_0_1px_rgba(34,211,238,0.06)]">
      <div className="space-y-6">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">Request help</div>
          <h3 className="mt-3 text-[1.95rem] font-black leading-tight text-white">
            Ask for donation credits without guesswork.
          </h3>
          <p className="mt-3 max-w-[52ch] text-base leading-8 text-slate-300">
            Requests are reviewed by an admin first. Approval and fulfillment are separate, so the status trail matters.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onReload()}
          className="inline-flex h-12 items-center rounded-2xl border border-slate-700 bg-slate-900 px-6 text-base font-bold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
        >
          Reload
        </button>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">Requested credits</div>
            <input
              type="number"
              min={5}
              max={200}
              step={1}
              value={requestedCredits}
              onChange={(event) => setRequestedCredits(Number(event.target.value || 0))}
              className="mt-4 h-14 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 text-2xl font-black text-white outline-none transition focus:border-cyan-400"
            />
            <p className="mt-3 text-sm text-slate-400">Min 5, max 200.</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">Request status</div>
            <div className="mt-4 text-5xl font-black leading-none text-white">{latestStatus}</div>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {requests.length
                ? "Your latest request status is shown here so you can quickly see where things stand."
                : "You have not submitted a request yet."}
            </p>
          </div>
        </div>

        <div>
          <div className="text-xs font-black uppercase tracking-[0.35em] text-slate-400">Reason</div>
          <textarea
            value={requestReason}
            onChange={(event) => setRequestReason(event.target.value)}
            rows={4}
            className="mt-4 min-h-[106px] w-full rounded-3xl border border-slate-700 bg-slate-950 px-5 py-4 text-base leading-7 text-white outline-none transition focus:border-cyan-400"
            placeholder="Tell us what you're applying for and why you need help (10+ characters)."
          />
          <p className="mt-3 text-sm text-slate-400">Keep it short and clear. Include target role/company if useful.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={requestBusy}
            className="inline-flex h-12 items-center rounded-2xl bg-cyan-500 px-6 text-base font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requestBusy ? "Submitting..." : "Submit request"}
          </button>
          {requestError ? <p className="text-sm text-rose-300">{requestError}</p> : null}
          {requestSuccess ? <p className="text-sm text-emerald-300">{requestSuccess}</p> : null}
          <p className="text-sm text-slate-400">You can have a limited number of pending requests. Cooldown may apply.</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <button
            type="button"
            onClick={() => setRecentOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <div>
              <div className="text-xl font-black text-white">Your recent requests</div>
              <div className="mt-1 text-sm text-slate-400">{recentOpen ? "Hide history" : "Show history"}</div>
            </div>
            <div className="text-sm font-bold text-slate-400">Showing up to 10</div>
          </button>

          {recentOpen ? (
            <div className="mt-5 space-y-4">
              {requests.length ? (
                requests.slice(0, 10).map((request) => (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-200"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-black text-white">{request.amount} credits</span>
                      <span className="rounded-full border border-slate-700 px-2 py-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                        {request.status}
                      </span>
                    </div>
                    {request.reason ? <div className="mt-2 text-slate-300">{request.reason}</div> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-5 text-base text-slate-400">
                  No requests yet.
                </div>
              )}

              <p className="text-sm leading-7 text-slate-400">
                Status meanings: <span className="font-bold text-slate-200">pending</span> (waiting review),{" "}
                <span className="font-bold text-slate-200">approved</span> (eligible),{" "}
                <span className="font-bold text-slate-200">fulfilled</span> (credits issued),{" "}
                <span className="font-bold text-slate-200">rejected</span> (not eligible).
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
