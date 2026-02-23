"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Check, Users } from "lucide-react";
import { CreateGroupDialog } from "./create-group-dialog";
import { JoinGroupDialog } from "./join-group-dialog";

interface GroupSwitcherProps {
  groups: { id: string; name: string; memberCount: number }[];
  currentGroupId: string;
}

export function GroupSwitcher({ groups, currentGroupId }: GroupSwitcherProps) {
  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isCurrent = group.id === currentGroupId;
        return (
          <Link
            key={group.id}
            href={`/g/${group.id}/manage`}
            className={cn(
              "flex items-center justify-between rounded-lg border p-3 transition-colors",
              isCurrent
                ? "border-primary bg-primary/5"
                : "hover:bg-accent/50",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full",
                  isCurrent ? "bg-primary/10" : "bg-muted",
                )}
              >
                <Users
                  className={cn(
                    "size-4",
                    isCurrent ? "text-primary" : "text-muted-foreground",
                  )}
                />
              </div>
              <div>
                <p className={cn("font-medium", isCurrent && "text-primary")}>
                  {group.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {group.memberCount} membre{group.memberCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>
            {isCurrent && <Check className="size-5 text-primary" />}
          </Link>
        );
      })}

      <div className="flex gap-2 pt-2">
        <CreateGroupDialog />
        <JoinGroupDialog />
      </div>
    </div>
  );
}
