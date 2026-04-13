export default function JobDetailLoading() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 h-5 w-36 animate-pulse rounded bg-white/10" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="mt-4 h-4 w-1/3 rounded bg-white/10" />
            <div className="mt-8 h-72 rounded bg-white/10" />
          </div>
          <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="h-5 w-28 rounded bg-white/10" />
            <div className="mt-4 h-14 w-24 rounded bg-white/10" />
            <div className="mt-8 h-48 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </main>
  );
}
