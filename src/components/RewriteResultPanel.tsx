"use client";

import React from "react";

type Props = {
  isLoading?: boolean;
  originalBullet: string;

  // Response fields from /api/rewrite-bullet
  rewrittenBullet?: string;
  needsMoreInfo?: boolean;
  notes?: string[];
  keywordHits?: string[];
  blockedKeywords?: string[];

  // Optional: error display
  error?: string | null;
};

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        muted
          ? "border-zinc-700 text-zinc-400 bg-zinc-900/40"
          : "border-zinc-700 text-zinc-200 bg-zinc-900/60",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export default function RewriteResultPanel({
  isLoading,
  originalBullet,
  rewrittenBullet,
  needsMoreInfo,
  notes,
  keywordHits,
  blockedKeywords,
  error,
}: Props) {
  const showNotes = Array.isArray(notes) && notes.length > 0;
  const showHits = Array.isArray(keywordHits) && keywordHits.length > 0;
  const showBlocked = Array.isArray(blockedKeywords) && blockedKeywords.length > 0;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Rewrite Result</h3>
          <p className="text-xs text-zinc-400">
            Shows what changed, and why.
          </p>
        </div>

        {isLoading ? (
          <span className="text-xs text-zinc-400">Rewriting…</span>
        ) : null}
      </div>

      {/* Error */}
      {error ? (
        <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/30 p-3">
          <div className="text-sm font-semibold text-red-200">Rewrite failed</div>
          <div className="mt-1 text-sm text-red-200/80">{error}</div>
        </div>
      ) : null}

      {/* Needs More Info callout */}
      {needsMoreInfo ? (
        <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3">
          <div className="text-sm font-semibold text-amber-200">
            Needs a bit more detail
          </div>
          <div className="mt-1 text-sm text-amber-200/80">
            This bullet reads like a label/definition. Add what you did (tested, validated, documented, improved, owned) so the rewrite can stay truthful.
          </div>
        </div>
      ) : null}

      {/* Original */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-zinc-400">Original</div>
        <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200">
          {originalBullet || <span className="text-zinc-500">—</span>}
        </div>
      </div>

      {/* Rewritten */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-zinc-400">Rewritten</div>
        <div className="mt-1 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-100">
          {rewrittenBullet ? rewrittenBullet : <span className="text-zinc-500">—</span>}
        </div>
      </div>

      {/* Notes / Reasons */}
      {showNotes ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-400">Why this rewrite</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-200">
            {notes!.map((n, i) => (
              <li key={i} className="text-zinc-200/90">
                {n}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Keyword hits */}
      {showHits ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-400">Keywords used</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {keywordHits!.map((k, i) => (
              <Chip key={i}>{k}</Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* Blocked keywords */}
      {showBlocked ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-400">Removed keywords</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {blockedKeywords!.map((k, i) => (
              <Chip key={i} muted>
                {k}
              </Chip>
            ))}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            These were removed because they looked like target company/product terms.
          </div>
        </div>
      ) : null}
    </div>
  );
}
