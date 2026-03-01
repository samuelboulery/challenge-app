"use client";

import { useActionState, useState } from "react";
import { joinGroupByCode } from "@/app/(app)/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsivePanel,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
  ResponsivePanelTrigger,
} from "@/components/ui/responsive-panel";
import { KeyRound } from "lucide-react";

export function JoinGroupDialog() {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await joinGroupByCode(formData);
      return result ?? null;
    },
    null,
  );

  return (
    <ResponsivePanel open={open} onOpenChange={setOpen}>
      <ResponsivePanelTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound className="mr-1 size-4" />
          Rejoindre
        </Button>
      </ResponsivePanelTrigger>
      <ResponsivePanelContent>
        <ResponsivePanelHeader>
          <ResponsivePanelTitle>Rejoindre un groupe</ResponsivePanelTitle>
          <ResponsivePanelDescription>
            Entre le code d&apos;invitation partagé par un ami.
          </ResponsivePanelDescription>
        </ResponsivePanelHeader>
        <form action={formAction}>
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="code">Code d&apos;invitation</Label>
              <Input
                id="code"
                name="code"
                placeholder="abc12def"
                required
                autoComplete="off"
              />
            </div>
          </div>
          <ResponsivePanelFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Recherche..." : "Rejoindre"}
            </Button>
          </ResponsivePanelFooter>
        </form>
      </ResponsivePanelContent>
    </ResponsivePanel>
  );
}
