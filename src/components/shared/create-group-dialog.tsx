"use client";

import { useActionState, useState } from "react";
import { createGroup } from "@/app/(app)/groups/actions";
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
import { Plus } from "lucide-react";

export function CreateGroupDialog() {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await createGroup(formData);
      return result ?? null;
    },
    null,
  );

  return (
    <ResponsivePanel open={open} onOpenChange={setOpen}>
      <ResponsivePanelTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" />
          Créer
        </Button>
      </ResponsivePanelTrigger>
      <ResponsivePanelContent>
        <ResponsivePanelHeader>
          <ResponsivePanelTitle>Créer un groupe</ResponsivePanelTitle>
          <ResponsivePanelDescription>
            Crée un groupe et invite tes amis avec le code.
          </ResponsivePanelDescription>
        </ResponsivePanelHeader>
        <form action={formAction}>
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nom du groupe</Label>
              <Input
                id="name"
                name="name"
                placeholder="Les indomptables"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnel)</Label>
              <Input
                id="description"
                name="description"
                placeholder="Un groupe de défis entre amis"
              />
            </div>
          </div>
          <ResponsivePanelFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Création..." : "Créer le groupe"}
            </Button>
          </ResponsivePanelFooter>
        </form>
      </ResponsivePanelContent>
    </ResponsivePanel>
  );
}
