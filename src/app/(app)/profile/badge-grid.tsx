import { cn } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Zap,
  ShoppingBag,
  Users,
  Star,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  trophy: Trophy,
  flame: Flame,
  zap: Zap,
  "shopping-bag": ShoppingBag,
  users: Users,
  star: Star,
};

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  condition_type: string;
  condition_value: number;
}

interface UserBadge {
  badge_id: string;
  earned_at: string;
}

interface BadgeGridProps {
  allBadges: Badge[];
  earnedBadgeIds: Set<string>;
  myBadges: UserBadge[];
  progress: {
    challenges_won: number;
    items_purchased: number;
    groups_joined: number;
  };
}

function getProgressForBadge(
  conditionType: string,
  progress: BadgeGridProps["progress"],
): number {
  switch (conditionType) {
    case "challenges_won":
      return progress.challenges_won;
    case "items_purchased":
      return progress.items_purchased;
    case "groups_joined":
      return progress.groups_joined;
    default:
      return 0;
  }
}

export function BadgeGrid({
  allBadges,
  earnedBadgeIds,
  myBadges,
  progress,
}: BadgeGridProps) {
  if (allBadges.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Aucun badge disponible.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {allBadges.map((badge) => {
        const earned = earnedBadgeIds.has(badge.id);
        const Icon = ICON_MAP[badge.icon] ?? Trophy;
        const current = getProgressForBadge(badge.condition_type, progress);
        const earnedEntry = myBadges.find((ub) => ub.badge_id === badge.id);

        return (
          <div
            key={badge.id}
            className={cn(
              "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
              earned
                ? "border-primary/40 bg-primary/5"
                : "border-muted bg-muted/30 opacity-60",
            )}
          >
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                earned ? "bg-primary/10" : "bg-muted",
              )}
            >
              <Icon
                className={cn(
                  "size-5",
                  earned ? "text-primary" : "text-muted-foreground",
                )}
              />
            </div>
            <p className="text-sm font-semibold leading-tight">{badge.name}</p>
            <p className="text-xs text-muted-foreground">{badge.description}</p>
            {earned && earnedEntry ? (
              <p className="text-xs text-primary">
                {new Date(earnedEntry.earned_at).toLocaleDateString("fr-FR")}
              </p>
            ) : (
              <div className="w-full">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/40 transition-all"
                    style={{
                      width: `${Math.min(100, (current / badge.condition_value) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {current}/{badge.condition_value}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
