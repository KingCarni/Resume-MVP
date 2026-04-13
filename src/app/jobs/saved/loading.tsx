export default function SavedJobsLoading() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="h-4 w-28 rounded bg-white/10" />
          <div className="mt-4 h-10 w-80 rounded bg-white/10" />
          <div className="mt-4 h-5 w-full max-w-3xl rounded bg-white/10" />
        </div>

        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="h-5 w-56 rounded bg-white/10" />
              <div className="mt-3 h-4 w-40 rounded bg-white/10" />
              <div className="mt-6 h-20 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
