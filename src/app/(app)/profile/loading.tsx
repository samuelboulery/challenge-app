import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function ProfileLoading() {
  return (
    <main className="px-4 pt-8">
      <Skeleton className="h-7 w-28 mb-6" />

      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-10 w-24 rounded-lg" />
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <Skeleton className="h-5 w-28 mb-4" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>

      <Separator className="my-6" />

      <Skeleton className="h-5 w-36 mb-4" />
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </main>
  );
}
