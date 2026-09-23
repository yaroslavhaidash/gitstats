/** Placeholder block for content that is still loading. The pulse stops under reduced motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#222222] animate-pulse motion-reduce:animate-none ${className}`} />;
}

/** Tag + title + one line of sub-copy, next to the window tabs — the header every board shares. */
export function SkeletonHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <Skeleton className="h-6 w-40 mb-3" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-3 w-56 mt-3" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-8 w-56" />
      </div>
    </div>
  );
}

/** The leaderboard: header strip plus member rows, in the same columns as `Leaderboard`. */
export function SkeletonBoard({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel">
      <div className="border-b-2 border-dark px-4 py-3">
        <Skeleton className="h-3 w-full" />
      </div>
      <div className="divide-y divide-dark">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            <Skeleton className="h-3 w-4 shrink-0" />
            <Skeleton className="h-7 w-7 shrink-0" />
            <Skeleton className="h-4 w-28 shrink-0" />
            <div className="flex-1 hidden sm:flex items-center justify-end gap-6">
              {Array.from({ length: 6 }, (_, c) => (
                <Skeleton key={c} className="h-4 w-12" />
              ))}
            </div>
            <Skeleton className="h-6 w-24 sm:w-40 shrink-0 ml-auto sm:ml-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The stat tiles and the chart panels under them: the whole body of a member's page. */
export function SkeletonStats() {
  return (
    <>
      <div className="grid md:grid-cols-3 lg:grid-cols-6 border-2 border-dark">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="p-5 border-dark border-b-2 md:border-b-0 md:border-r-2 last:border-0">
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-10 mt-3" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-80 mt-2 mb-8" />

      <div className="grid lg:grid-cols-[2fr_1fr] gap-8 mb-8">
        <section className="panel p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-52 w-full" />
        </section>
        <section className="panel p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <Skeleton className="h-40 w-full" />
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <section className="panel p-6 lg:col-span-2">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-3 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </section>
        <section className="panel p-6">
          <Skeleton className="h-5 w-36 mb-2" />
          <Skeleton className="h-3 w-52 mb-4" />
          <Skeleton className="h-28 w-full" />
        </section>
        <section className="panel p-6">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3 w-52 mb-4" />
          <Skeleton className="h-28 w-full" />
        </section>
      </div>

      <section className="panel">
        <div className="flex justify-between items-center px-4 py-3 border-b-2 border-dark">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="divide-y divide-dark">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-16 hidden sm:block" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** The race and the two per-member charts under a crew's leaderboard. */
export function SkeletonCharts() {
  return (
    <>
      <section className="panel p-6 mt-8">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-3 w-64 mb-4" />
        <Skeleton className="h-56 w-full" />
      </section>
      <div className="grid lg:grid-cols-2 gap-8 mt-8">
        {Array.from({ length: 2 }, (_, i) => (
          <section key={i} className="panel p-6">
            <Skeleton className="h-5 w-44 mb-2" />
            <Skeleton className="h-3 w-40 mb-4" />
            <Skeleton className="h-48 w-full" />
          </section>
        ))}
      </div>
    </>
  );
}
