import { Skeleton } from "@/components/ui/skeleton";
import { NotificationSkeleton } from "@/components/shared/card-skeleton";

export default function NotificationsLoading() {
  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>

      <div className="space-y-2">
        <NotificationSkeleton />
        <NotificationSkeleton />
        <NotificationSkeleton />
        <NotificationSkeleton />
        <NotificationSkeleton />
      </div>
    </main>
  );
}
