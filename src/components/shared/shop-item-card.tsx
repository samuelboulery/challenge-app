"use client";

import { useActionState, useState } from "react";
import { deleteShopItem, updateShopItem } from "@/app/(app)/groups/[id]/shop-actions";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/responsive-panel";
import { BuyItemButton } from "./buy-item-button";
import { Coins, Package, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";
import {
  getStoreItemCategoryLabel,
  IMMEDIATE_AUTO_EFFECT_ITEM_TYPES,
  IMMEDIATE_TARGET_ITEM_TYPES,
} from "@/lib/store-item-types";
import { StoreItemCategoryBadge } from "./store-item-category-badge";

interface ShopItemCardProps {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  itemType: string;
  isAdmin: boolean;
  groupMembers?: { id: string; username: string }[];
  currentUserId?: string;
}

export function ShopItemCard({
  id,
  groupId,
  name,
  description,
  price,
  stock,
  itemType,
  isAdmin,
  groupMembers = [],
  currentUserId,
}: ShopItemCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isSpecial = itemType !== "custom";

  const [, deleteAction, deletePending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await deleteShopItem(formData);
      return result ?? null;
    },
    null,
  );

  const [editState, editAction, editPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await updateShopItem(formData);
      if (result?.success) {
        setEditOpen(false);
      }
      return result ?? null;
    },
    null,
  );

  useEffect(() => {
    if (editState?.success) {
      toast.success("Item modifié");
    }
    if (editState?.error) {
      toast.error(editState.error);
    }
  }, [editState]);

  const outOfStock = stock !== null && stock <= 0;
  const itemCategoryLabel = getStoreItemCategoryLabel(itemType);
  const stockLabel = stock === null ? "Illimité" : `${stock} restant${stock > 1 ? "s" : ""}`;

  return (
    <>
      <Card className={outOfStock ? "py-0 opacity-60" : "py-0"}>
        <CardContent
          className="flex items-center justify-between py-2.5 pr-2.5 sm:py-3 sm:pr-3"
          role="button"
          tabIndex={0}
          onClick={() => setDetailsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDetailsOpen(true);
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold sm:text-base">{name}</h3>
              <StoreItemCategoryBadge itemType={itemType} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground sm:mt-1 sm:gap-3 sm:text-xs">
              <span className="flex items-center gap-1">
                <Coins className="size-3.5" />
                {price} pts
              </span>
              <span className="flex items-center gap-1">
                <Package className="size-3.5" />
                {stockLabel}
              </span>
            </div>
            {(IMMEDIATE_AUTO_EFFECT_ITEM_TYPES as readonly string[]).includes(itemType) && (
              <p className="mt-0.5 text-xs text-orange-600 dark:text-orange-400 sm:mt-1">
                Effet immédiat à l&apos;achat
              </p>
            )}
            {(IMMEDIATE_TARGET_ITEM_TYPES as readonly string[]).includes(itemType) && (
              <p className="mt-0.5 text-xs text-orange-600 dark:text-orange-400 sm:mt-1">
                Effet immédiat avec choix de cible
              </p>
            )}
          </div>
          <div
            className="ml-2 flex shrink-0 items-center gap-1.5 sm:ml-3 sm:gap-2"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <BuyItemButton
              itemId={id}
              groupId={groupId}
              price={price}
              itemType={itemType}
              disabled={outOfStock}
              groupMembers={groupMembers}
              currentUserId={currentUserId}
            />
            {isAdmin && (
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                {!isSpecial && (
                  <form action={deleteAction}>
                    <input type="hidden" name="itemId" value={id} />
                    <input type="hidden" name="groupId" value={groupId} />
                    <Button
                      type="submit"
                      size="icon-sm"
                      variant="ghost"
                      disabled={deletePending}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ResponsivePanel open={detailsOpen} onOpenChange={setDetailsOpen}>
        <ResponsivePanelContent>
          <ResponsivePanelHeader>
            <ResponsivePanelTitle>{name}</ResponsivePanelTitle>
            <ResponsivePanelDescription>
              {`${itemCategoryLabel} · ${price} pts`}
            </ResponsivePanelDescription>
          </ResponsivePanelHeader>
          <div className="space-y-3 py-4">
            {description ? (
              <p className="text-sm leading-relaxed">{description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune description disponible pour cet item.
              </p>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="size-4" />
              <span>{price} points</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="size-4" />
              <span>{stockLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Catégorie:
              </span>
              <StoreItemCategoryBadge
                itemType={itemType}
                className="text-[10px] sm:text-[11px]"
              />
            </div>
          </div>
        </ResponsivePanelContent>
      </ResponsivePanel>

      <ResponsivePanel open={editOpen} onOpenChange={setEditOpen}>
        <ResponsivePanelContent>
          <ResponsivePanelHeader>
            <ResponsivePanelTitle>Modifier {name}</ResponsivePanelTitle>
            <ResponsivePanelDescription>
              Ajuste le prix et le stock de cet item.
            </ResponsivePanelDescription>
          </ResponsivePanelHeader>
          <form action={editAction}>
            <input type="hidden" name="itemId" value={id} />
            <input type="hidden" name="groupId" value={groupId} />
            <div className="space-y-4 py-4">
              {editState?.error && (
                <p className="text-sm text-destructive">{editState.error}</p>
              )}
              <div className="space-y-2">
                <Label htmlFor={`price-${id}`}>Prix (en points)</Label>
                <Input
                  id={`price-${id}`}
                  name="price"
                  type="number"
                  min={1}
                  max={100000}
                  inputMode="numeric"
                  step={1}
                  defaultValue={price}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`stock-${id}`}>Stock (vide = illimité)</Label>
                <Input
                  id={`stock-${id}`}
                  name="stock"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  step={1}
                  defaultValue={stock ?? ""}
                  placeholder="Illimité"
                />
              </div>
            </div>
            <ResponsivePanelFooter>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </ResponsivePanelFooter>
          </form>
        </ResponsivePanelContent>
      </ResponsivePanel>
    </>
  );
}
