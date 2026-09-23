import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto">
      <Skeleton className="h-6 w-56 mb-4" />
      <Skeleton className="h-9 w-80 mb-3" />
      <Skeleton className="h-3 w-full max-w-xl mb-2" />
      <Skeleton className="h-3 w-full max-w-lg mb-10" />
      <div className="grid gap-6 mb-10">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="border-2 border-dark p-6">
            <Skeleton className="h-5 w-48 mt-2 mb-3" />
            <Skeleton className="h-3 w-full max-w-lg mb-2" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        ))}
      </div>
      <div className="border-2 border-dark p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}
