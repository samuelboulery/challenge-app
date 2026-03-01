"use client";

import { useActionState, useState, useTransition } from "react";
import { purchaseItem, purchaseImmediateMalusWithTarget } from "@/app/(app)/groups/[id]/shop-actions";
import { Button } from "@/components/ui/button";
import {
  ResponsivePanel,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
} from "@/components/ui/responsive-panel";
import { ShoppingCart, Skull } from "lucide-react";
import { toast } from "sonner";

interface BuyItemButtonProps {
  itemId: string;
  groupId: string;
  price: number;
  itemType?: string;
  disabled?: boolean;
  groupMembers?: { id: string; username: string }[];
  currentUserId?: string;
}

export function BuyItemButton({
  itemId,
  groupId,
  price,
  itemType = "custom",
  disabled,
  groupMembers = [],
  currentUserId,
}: BuyItemButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [isApplyingTarget, startApplyingTarget] = useTransition();

  const [, formAction, pending] = useActionState(
    async (
      _prev:
        | {
            error?: string;
            success?: boolean;
            voleur?: { stolen: number; victimUsername: string };
            immediateItemType?: string;
          }
        | null,
      formData: FormData,
    ) => {
      const result = await purchaseItem(formData);
      if (result?.success) {
        setConfirmOpen(false);
        if (result.voleur) {
          toast.success(
            `Vol réussi ! Tu as volé ${result.voleur.stolen} points à ${result.voleur.victimUsername}`,
          );
        } else if (result.immediateItemType === "robin_des_bois") {
          toast.success("Achat effectué ! Robin des Bois a été appliqué immédiatement.");
        } else if (result.immediateItemType === "mouchard") {
          toast.success("Achat effectué ! Mouchard est actif immédiatement (1h).");
        } else if (result.immediateItemType === "mode_fantome") {
          toast.success("Achat effectué ! Mode Fantôme est actif immédiatement (24h).");
        } else {
          toast.success("Achat effectué !");
        }
      } else if (result?.error) {
        toast.error(result.error);
      }
      return result ?? null;
    },
    null,
  );

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
          <ShoppingCart className="mr-1 size-3.5" />
          {price} pts
        </Button>
        <ResponsivePanel open={confirmOpen} onOpenChange={setConfirmOpen}>
          <ResponsivePanelContent>
            <ResponsivePanelHeader>
              <ResponsivePanelTitle className="flex items-center gap-2">
                <Skull className="size-5 text-red-500" />
                Confirmer le vol
              </ResponsivePanelTitle>
              <ResponsivePanelDescription>
                Cet item va immédiatement voler 30% des points du joueur en
                tête du classement. Cette action est irréversible.
              </ResponsivePanelDescription>
            </ResponsivePanelHeader>
            <ResponsivePanelFooter className="flex-col gap-2 sm:flex-col">
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
            </ResponsivePanelFooter>
          </ResponsivePanelContent>
        </ResponsivePanel>
      </>
    );
  }

  const isImmediateTargetItem = itemType === "menottes" || itemType === "embargo";

  if (isImmediateTargetItem) {
    return (
      <>
        <Button
          type="button"
          size="sm"
          disabled={pending || isApplyingTarget || disabled}
          onClick={() => setTargetOpen(true)}
        >
          <ShoppingCart className="mr-1 size-3.5" />
          {isApplyingTarget ? "..." : `${price} pts`}
        </Button>

        <ResponsivePanel open={targetOpen} onOpenChange={setTargetOpen}>
          <ResponsivePanelContent>
            <ResponsivePanelHeader>
              <ResponsivePanelTitle>
                Choisir la cible ({itemType === "menottes" ? "Menottes" : "Embargo"})
              </ResponsivePanelTitle>
              <ResponsivePanelDescription>
                L&apos;effet est appliqué immédiatement à la personne sélectionnée.
              </ResponsivePanelDescription>
            </ResponsivePanelHeader>
            <div className="space-y-2 py-2">
              {groupMembers.filter((member) => member.id !== currentUserId).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucune cible disponible dans ce groupe.
                </p>
              )}
              {groupMembers
                .filter((member) => member.id !== currentUserId)
                .map((member) => (
                  <Button
                    key={member.id}
                    variant="outline"
                    className="w-full justify-start"
                    disabled={pending || isApplyingTarget || disabled}
                    onClick={() =>
                      startApplyingTarget(async () => {
                        const result = await purchaseImmediateMalusWithTarget({
                          itemId,
                          groupId,
                          targetProfileId: member.id,
                        });
                        if ("error" in result) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Achat effectué et malus appliqué immédiatement");
                        setTargetOpen(false);
                      })
                    }
                  >
                    {member.username}
                  </Button>
                ))}
            </div>
            <ResponsivePanelFooter>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setTargetOpen(false);
                }}
                disabled={pending || isApplyingTarget}
              >
                Fermer
              </Button>
            </ResponsivePanelFooter>
          </ResponsivePanelContent>
        </ResponsivePanel>
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
