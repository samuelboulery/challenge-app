import { Skeleton } from "@/components/ui/skeleton";
import { ChallengeCardSkeleton } from "@/components/shared/card-skeleton";

export default function GroupChallengesLoading() {
  return (
    <main className="px-4 pt-8">
      <Skeleton className="h-7 w-40" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
        <ChallengeCardSkeleton />
      </div>
    </main>
  );
}
