import Link from "next/link";
import { ChevronRight, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChallengeStatus } from "@/types/database.types";

const STATUS_CONFIG: Record<
  ChallengeStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  proposed: { label: "Proposé", variant: "outline" },
  negotiating: { label: "Contestation en cours", variant: "outline" },
  accepted: { label: "Accepté", variant: "secondary" },
  in_progress: { label: "En cours", variant: "secondary" },
  proof_submitted: { label: "Preuve soumise", variant: "default" },
  validated: { label: "Validé", variant: "default" },
  rejected: { label: "Rejeté", variant: "destructive" },
  expired: { label: "Expiré", variant: "destructive" },
  cancelled: { label: "Refusé", variant: "destructive" },
};

interface ChallengeCardProps {
  id: string;
  title: string;
  points: number;
  status: ChallengeStatus;
  creatorName: string;
  targetName: string;
  groupName?: string;
  groupId?: string;
}

export function ChallengeCard({
  id,
  title,
  points,
  status,
  creatorName,
  targetName,
  groupName,
  groupId,
}: ChallengeCardProps) {
  const config = STATUS_CONFIG[status];
  const href = groupId
    ? `/g/${groupId}/challenges/${id}`
    : `/challenges/${id}`;

  return (
    <Link href={href} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{title}</h3>
              <Badge variant={config.variant} className="shrink-0 text-xs">
                {config.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground truncate">
              {creatorName} → {targetName}
            </p>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Coins className="size-3.5" />
                {points} pts
              </span>
              {groupName && <span>{groupName}</span>}
            </div>
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
