"use client";

import React from "react";

type Pack = "starter" | "plus" | "pro";

export default function BuyCreditsButton({
  userId = "test-user-123",
  pack = "starter",
}: {
  userId?: string;
  pack?: Pack;
}) {
  return (
    <div className="mb-6">
      <button
        onClick={async () => {
          try {
            const res = await fetch("/api/stripe/checkout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId, pack }),
            });

            const contentType = res.headers.get("content-type") || "";
            const raw = await res.text();

            if (!res.ok) {
              alert(`Checkout failed (${res.status}).\n\n${raw.slice(0, 500)}`);
              return;
            }

            if (!contentType.includes("application/json")) {
              alert(
                `Expected JSON but got: ${contentType}\n\n` +
                  raw.slice(0, 500)
              );
              return;
            }

            const data = JSON.parse(raw);
            if (!data?.ok || !data?.url) {
              alert(`Unexpected JSON:\n\n${raw}`);
              return;
            }

            window.location.href = data.url;
          } catch (e: any) {
            alert(e?.message || "Checkout failed");
          }
        }}
        className="rounded-xl bg-black px-6 py-3 font-semibold text-white"
      >
        💳 Buy Credits (test)
      </button>
    </div>
  );
}
