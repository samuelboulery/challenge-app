import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ChallengeCardSkeleton } from "@/components/shared/card-skeleton";

export default function HomeLoading() {
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

      <div className="space-y-2 mb-4">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="space-y-3">
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
      </div>
    </main>
  );
}
