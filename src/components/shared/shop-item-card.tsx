"use client";

import { useActionState, useState } from "react";
import { deleteShopItem, updateShopItem } from "@/app/(app)/groups/[id]/shop-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BuyItemButton } from "./buy-item-button";
import { Flame, Package, Trash2, Shield, Zap, Skull, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

const ITEM_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof Shield; className: string }
> = {
  joker: {
    label: "Joker",
    icon: Shield,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  booster: {
    label: "Booster",
    icon: Zap,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  voleur: {
    label: "Voleur",
    icon: Skull,
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

interface ShopItemCardProps {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  itemType: string;
  isAdmin: boolean;
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
}: ShopItemCardProps) {
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
  const typeConfig = ITEM_TYPE_CONFIG[itemType];

  return (
    <>
      <Card className={outOfStock ? "opacity-60" : ""}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{name}</h3>
              {typeConfig && (
                <Badge variant="secondary" className={`text-xs shrink-0 ${typeConfig.className}`}>
                  <typeConfig.icon className="mr-1 size-3" />
                  {typeConfig.label}
                </Badge>
              )}
            </div>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground truncate">
                {description}
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Flame className="size-3.5" />
                {price} pts
              </span>
              <span className="flex items-center gap-1">
                <Package className="size-3.5" />
                {stock === null ? "Illimité" : `${stock} restant${stock > 1 ? "s" : ""}`}
              </span>
            </div>
            {itemType === "voleur" && (
              <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                Effet immédiat à l&apos;achat
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <BuyItemButton
              itemId={id}
              groupId={groupId}
              price={price}
              itemType={itemType}
              disabled={outOfStock}
            />
            {isAdmin && (
              <>
                <Button
                  size="sm"
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
                      size="sm"
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier {name}</DialogTitle>
            <DialogDescription>
              Ajuste le prix et le stock de cet item.
            </DialogDescription>
          </DialogHeader>
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
                  defaultValue={stock ?? ""}
                  placeholder="Illimité"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
