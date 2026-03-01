"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAsRead } from "./actions";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Swords,
  CheckCircle,
  XCircle,
  FileText,
  Bell,
} from "lucide-react";

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Bell; color: string }
> = {
  badge_earned: { icon: Trophy, color: "text-yellow-500" },
  challenge_received: { icon: Swords, color: "text-blue-500" },
  challenge_validated: { icon: CheckCircle, color: "text-green-500" },
  challenge_rejected: { icon: XCircle, color: "text-red-500" },
  proof_submitted: { icon: FileText, color: "text-purple-500" },
  price_validation_requested: { icon: Bell, color: "text-orange-500" },
  challenge_contestation_requested: { icon: Bell, color: "text-orange-500" },
  challenge_counter_proposal_applied: { icon: CheckCircle, color: "text-green-500" },
  challenge_cancelled_by_contestation: { icon: XCircle, color: "text-red-500" },
  challenge_kept_by_contestation: { icon: CheckCircle, color: "text-blue-500" },
  proof_validation_requested: { icon: FileText, color: "text-indigo-500" },
};

interface NotificationItemProps {
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
    metadata?: Record<string, unknown> | null;
  };
}

function getDeepLink(
  type: string,
  metadata?: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  const groupId = metadata.group_id as string | undefined;
  const challengeId = metadata.challenge_id as string | undefined;

  if (groupId && challengeId) {
    return `/g/${groupId}/challenges/${challengeId}`;
  }
  if (challengeId) {
    return `/challenges/${challengeId}`;
  }
  if (groupId) {
    return `/g/${groupId}`;
  }
  return null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const config = TYPE_CONFIG[notification.type] ?? {
    icon: Bell,
    color: "text-muted-foreground",
  };
  const Icon = config.icon;
  const deepLink = getDeepLink(notification.type, notification.metadata);

  const handleClick = () => {
    if (!notification.read) {
      startTransition(async () => { await markAsRead(notification.id); });
    }
    if (deepLink) {
      router.push(deepLink);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={notification.read ? notification.title : `Marquer comme lu : ${notification.title}`}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        !notification.read && "border-primary/30 bg-primary/5",
        deepLink && "cursor-pointer hover:bg-accent/50",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
        )}
      >
        <Icon className={cn("size-4", config.color)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "text-sm",
              !notification.read ? "font-semibold" : "font-medium",
            )}
          >
            {notification.title}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">
            {timeAgo(notification.created_at)}
          </span>
        </div>
        {notification.body && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {notification.body}
          </p>
        )}
      </div>
      {!notification.read && (
        <div className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}
