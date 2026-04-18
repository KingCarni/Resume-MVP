export type JobAnalyticsEventName =
  | "jobs_feed_view"
  | "jobs_resume_profile_selected"
  | "jobs_view_job_clicked"
  | "jobs_save_clicked"
  | "jobs_hide_clicked"
  | "job_detail_view"
  | "job_detail_resume_profile_selected"
  | "job_detail_tailor_resume_clicked"
  | "job_detail_cover_letter_clicked"
  | "job_detail_tailor_both_clicked"
  | "job_detail_save_clicked"
  | "job_detail_hide_clicked"
  | "job_context_resume_entry"
  | "job_context_cover_letter_entry"
  | "job_resume_analysis_started"
  | "job_resume_analysis_completed"
  | "job_resume_analysis_failed"
  | "job_resume_credit_charged"
  | "job_cover_letter_started"
  | "job_cover_letter_completed"
  | "job_cover_letter_failed"
  | "job_cover_letter_credit_charged"
  | "job_apply_pack_started"
  | "job_apply_pack_completed"
  | "job_apply_pack_failed"
  | "job_buy_credits_view"
  | "job_buy_credits_checkout_started"
  | "job_buy_credits_purchase_completed";

export type JobAnalyticsPayload = {
  event: JobAnalyticsEventName;
  jobId?: string;
  resumeProfileId?: string;
  company?: string;
  jobTitle?: string;
  sourceSlug?: string;
  route?: string;
  mode?: "resume" | "cover_letter" | "apply_pack" | "browse";
  matchScore?: number | null;
  creditsCost?: number | null;
  refunded?: boolean | null;
  page?: number;
  sort?: string;
  search?: string;
  remote?: string;
  seniority?: string;
  location?: string;
  minSalary?: string;
  totalJobs?: number;
  meta?: Record<string, unknown>;
};

const ANALYTICS_ENDPOINT = "/api/analytics";

function buildBody(payload: JobAnalyticsPayload) {
  return JSON.stringify({
    category: "jobs",
    createdAt: new Date().toISOString(),
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    ...payload,
  });
}

export function trackJobEvent(payload: JobAnalyticsPayload) {
  if (typeof window === "undefined") return;

  const body = buildBody(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        ANALYTICS_ENDPOINT,
        new Blob([body], { type: "application/json" })
      );

      if (ok) {
        if (process.env.NODE_ENV !== "production") {
          console.info("[jobs analytics]", payload.event, payload);
        }
        return;
      }
    }
  } catch {
    // fallback below
  }

  void fetch(ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body,
  }).catch(() => {});

  if (process.env.NODE_ENV !== "production") {
    console.info("[jobs analytics]", payload.event, payload);
  }
}
