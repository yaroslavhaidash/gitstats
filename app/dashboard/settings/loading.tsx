import { Skeleton } from "@/components/Skeleton";

/** Five bordered sections: linked computers, what others see, streak rule, read-only PAT, data. */
const SECTIONS = ["h-24", "h-48", "h-20", "h-40", "h-32"];

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto">
      <Skeleton className="h-6 w-56 mb-4" />
      <Skeleton className="h-9 w-64 mb-10" />
      {SECTIONS.map((body, i) => (
        <section key={i} className="border-2 border-dark p-6 mb-8">
          <Skeleton className="h-6 w-56 mb-3" />
          <Skeleton className="h-3 w-full max-w-lg mb-2" />
          <Skeleton className="h-3 w-full max-w-md mb-6" />
          <Skeleton className={`w-full ${body}`} />
        </section>
      ))}
    </div>
  );
}
