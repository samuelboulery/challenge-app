"use client";

import { useActionState, useState } from "react";
import { addShopItem } from "@/app/(app)/groups/[id]/shop-actions";
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

interface AddShopItemDialogProps {
  groupId: string;
}

export function AddShopItemDialog({ groupId }: AddShopItemDialogProps) {
  const [open, setOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await addShopItem(formData);
      if (result?.success) {
        setOpen(false);
      }
      return result ?? null;
    },
    null,
  );

  return (
    <ResponsivePanel open={open} onOpenChange={setOpen}>
      <ResponsivePanelTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 size-4" />
          Item perso
        </Button>
      </ResponsivePanelTrigger>
      <ResponsivePanelContent>
        <ResponsivePanelHeader>
          <ResponsivePanelTitle>Ajouter un item personnalisé</ResponsivePanelTitle>
          <ResponsivePanelDescription>
            Crée un item custom que les membres pourront acheter avec leurs
            points. Les items spéciaux (Joker, Booster, Voleur) sont déjà
            disponibles automatiquement.
          </ResponsivePanelDescription>
        </ResponsivePanelHeader>
        <form action={formAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="itemType" value="custom" />
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input
                id="name"
                name="name"
                placeholder="Gage : faire le poulet"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnel)</Label>
              <Input
                id="description"
                name="description"
                placeholder="Le perdant doit faire le poulet en public"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Prix (en points)</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={1}
                placeholder="50"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Stock (vide = illimité)</Label>
              <Input
                id="stock"
                name="stock"
                type="number"
                min={0}
                placeholder="Illimité"
              />
            </div>
          </div>
          <ResponsivePanelFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Ajout..." : "Ajouter l'item"}
            </Button>
          </ResponsivePanelFooter>
        </form>
      </ResponsivePanelContent>
    </ResponsivePanel>
  );
}
