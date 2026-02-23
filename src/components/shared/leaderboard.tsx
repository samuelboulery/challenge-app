import { cn } from "@/lib/utils";
import { Flame, Medal } from "lucide-react";

interface LeaderboardEntry {
  profileId: string;
  username: string;
  totalPoints: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentUserId: string | undefined;
}

const MEDAL_STYLES = [
  "text-yellow-500",
  "text-gray-400",
  "text-amber-600",
] as const;

export function Leaderboard({ entries, currentUserId }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Aucun membre dans le classement.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => {
        const isCurrentUser = entry.profileId === currentUserId;
        const rank = index + 1;
        const hasMedal = rank <= 3;

        return (
          <div
            key={entry.profileId}
            className={cn(
              "flex items-center justify-between rounded-lg border p-3",
              isCurrentUser && "border-primary bg-primary/5",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center">
                {hasMedal ? (
                  <Medal
                    className={cn("size-5", MEDAL_STYLES[index] ?? "")}
                  />
                ) : (
                  <span className="text-sm font-medium text-muted-foreground">
                    {rank}
                  </span>
                )}
              </div>
              <span className={cn("font-medium", isCurrentUser && "text-primary")}>
                {entry.username}
                {isCurrentUser && " (toi)"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="size-4 text-orange-500" />
              <span className="font-semibold">{entry.totalPoints}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
