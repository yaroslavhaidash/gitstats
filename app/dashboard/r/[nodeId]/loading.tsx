import { Skeleton, SkeletonHeader } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <section className="panel p-6 mb-8">
        <Skeleton className="h-6 w-48 mb-2" />
        <Skeleton className="h-3 w-40 mb-4" />
        <Skeleton className="h-56 w-full" />
      </section>
      <section className="panel">
        <div className="px-4 py-3 border-b-2 border-dark">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="divide-y divide-dark">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
