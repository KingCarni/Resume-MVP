const STORAGE_KEY = "gitajob.pipelineStatus.v1";

export type PipelineStatus = "saved" | "applied" | "interviewing" | "archived";

export type PipelineStatusMap = Record<string, PipelineStatus>;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readPipelineStatusMap(): PipelineStatusMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, PipelineStatus] =>
          typeof entry[0] === "string" &&
          (entry[1] === "saved" ||
            entry[1] === "applied" ||
            entry[1] === "interviewing" ||
            entry[1] === "archived")
      )
    );
  } catch {
    return {};
  }
}

export function writePipelineStatus(jobId: string, status: PipelineStatus) {
  if (!canUseStorage()) return;
  const map = readPipelineStatusMap();
  map[jobId] = status;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function pipelineStatusLabel(status: PipelineStatus | null | undefined) {
  if (!status) return "Saved";
  if (status === "applied") return "Applied";
  if (status === "interviewing") return "Interviewing";
  if (status === "archived") return "Archived";
  return "Saved";
}

export function pipelineStatusTone(status: PipelineStatus | null | undefined) {
  if (status === "applied") return "border-cyan-400/20 bg-cyan-500/10 text-cyan-200";
  if (status === "interviewing") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
  if (status === "archived") return "border-slate-400/20 bg-slate-500/10 text-slate-200";
  return "border-white/10 bg-slate-900/70 text-slate-200";
}
