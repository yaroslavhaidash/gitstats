import { Skeleton, SkeletonStats } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-5">
          <Skeleton className="h-16 w-16 shrink-0" />
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-9 w-56" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-8 w-64" />
        </div>
      </div>
      <SkeletonStats />
    </>
  );
}
