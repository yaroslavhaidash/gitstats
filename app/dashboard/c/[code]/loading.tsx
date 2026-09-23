import { SkeletonBoard, SkeletonHeader } from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonHeader />
      <SkeletonBoard rows={4} />
    </>
  );
}
