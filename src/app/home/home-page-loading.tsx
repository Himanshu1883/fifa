export function HomePageLoadingSkeleton() {
  return (
    <div className="bg-[color:var(--ticketing-surface)] font-sans text-zinc-100">
      <div className="flex w-full flex-col gap-3 px-3 pb-4 pt-3 sm:px-4 sm:pb-5 sm:pt-4 lg:px-5">
        <div className="relative w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/35 ring-1 ring-white/[0.04]">
          <div className="space-y-4 border-b border-white/[0.06] px-4 py-5 sm:px-6">
            <div className="h-4 w-48 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-8 w-2/3 max-w-lg animate-pulse rounded-lg bg-white/[0.08]" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-black/25" />
              ))}
            </div>
            <div className="h-11 max-w-md animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-14 animate-pulse rounded-xl bg-white/[0.06]" />
          </div>
          <div className="space-y-4 px-4 py-5 sm:px-6">
            <div className="flex justify-between gap-4">
              <div className="h-6 w-24 animate-pulse rounded bg-white/[0.08]" />
              <div className="h-10 w-64 animate-pulse rounded-2xl bg-white/[0.08]" />
            </div>
            <div className="hidden lg:block">
              <div className="h-[min(50vh,28rem)] animate-pulse rounded-xl bg-black/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
