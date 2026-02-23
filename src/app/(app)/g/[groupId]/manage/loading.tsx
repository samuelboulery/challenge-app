import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

export default function ManageGroupLoading() {
  return (
    <main className="px-4 pt-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <Separator className="my-6" />

      <Skeleton className="h-5 w-40 mb-4" />
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>

      <Separator className="my-6" />

      <Skeleton className="h-5 w-36 mb-3" />
      <Skeleton className="h-12 w-full rounded-lg" />

      <Separator className="my-6" />

      <Skeleton className="h-5 w-24 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </main>
  );
}
