import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function ChallengeDetailLoading() {
  return (
    <main className="px-4 pt-8">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="mt-4 flex gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Separator className="my-6" />
      <Skeleton className="h-10 w-full" />
    </main>
  );
}
