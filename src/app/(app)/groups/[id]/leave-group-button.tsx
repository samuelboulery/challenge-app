"use client";

import { useActionState } from "react";
import { leaveGroup } from "@/app/(app)/groups/actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const [, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await leaveGroup(formData);
      return result ?? null;
    },
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="groupId" value={groupId} />
      <Button variant="destructive" type="submit" disabled={pending}>
        <LogOut className="mr-2 size-4" />
        {pending ? "En cours..." : "Quitter le groupe"}
      </Button>
    </form>
  );
}
