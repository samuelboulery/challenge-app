"use client";

import { useTransition } from "react";
import { markAllAsRead } from "./actions";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(async () => { await markAllAsRead(); })}
    >
      <CheckCheck className="mr-1 size-4" />
      Tout lire
    </Button>
  );
}
