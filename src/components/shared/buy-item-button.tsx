"use client";

import { useActionState, useState } from "react";
import { purchaseItem } from "@/app/(app)/groups/[id]/shop-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingCart, Skull } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

interface BuyItemButtonProps {
  itemId: string;
  groupId: string;
  price: number;
  itemType?: string;
  disabled?: boolean;
}

export function BuyItemButton({
  itemId,
  groupId,
  price,
  itemType = "custom",
  disabled,
}: BuyItemButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean; voleur?: { stolen: number; victimUsername: string } } | null, formData: FormData) => {
      const result = await purchaseItem(formData);
      return result ?? null;
    },
    null,
  );

  useEffect(() => {
    if (state?.success) {
      setConfirmOpen(false);
      if (state.voleur) {
        toast.success(
          `Vol réussi ! Tu as volé ${state.voleur.stolen} points à ${state.voleur.victimUsername}`,
        );
      } else {
        toast.success("Achat effectué !");
      }
    }
    if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  const handleClick = () => {
    if (itemType === "voleur") {
      setConfirmOpen(true);
    }
  };

  if (itemType === "voleur") {
    return (
      <>
        <Button
          size="sm"
          disabled={pending || disabled}
          onClick={handleClick}
        >
          <Skull className="mr-1 size-3.5" />
          {price} pts
        </Button>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Skull className="size-5 text-red-500" />
                Confirmer le vol
              </DialogTitle>
              <DialogDescription>
                Cet item va immédiatement voler 30% des points du joueur en
                tête du classement. Cette action est irréversible.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <form action={formAction} className="w-full">
                <input type="hidden" name="itemId" value={itemId} />
                <input type="hidden" name="groupId" value={groupId} />
                <Button
                  type="submit"
                  variant="destructive"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? "En cours..." : `Confirmer (-${price} pts)`}
                </Button>
              </form>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                Annuler
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="groupId" value={groupId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending || disabled}
      >
        <ShoppingCart className="mr-1 size-3.5" />
        {pending ? "..." : `${price} pts`}
      </Button>
    </form>
  );
}
