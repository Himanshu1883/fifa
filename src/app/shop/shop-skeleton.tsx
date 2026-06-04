export function ShopSkeletonList({ count = 12 }: { count?: number }) {
  return (
    <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.06]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex h-12 animate-pulse items-center gap-3 px-2">
          <div className="h-3 w-3 rounded bg-white/10" />
          <div className="h-3 w-8 rounded bg-white/10" />
          <div className="h-3 flex-1 max-w-[12rem] rounded bg-white/10" />
          <div className="h-3 w-14 rounded bg-white/10" />
          <div className="h-3 w-14 rounded bg-white/10" />
          <div className="h-3 w-14 rounded bg-white/10" />
        </div>
      ))}
    </div>
  );
}
