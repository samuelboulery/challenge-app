import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChallengeCardSkeleton } from "@/components/shared/card-skeleton";

export default function GroupHomeLoading() {
  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>

      <Separator className="my-6" />

      <Skeleton className="h-5 w-32 mb-4" />
      <div className="space-y-2">
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
      </div>
    </main>
  );
}
