"use client";

import { useActionState, useState } from "react";
import { createChallenge } from "@/app/(app)/challenges/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsivePanel,
  ResponsivePanelContent,
  ResponsivePanelDescription,
  ResponsivePanelFooter,
  ResponsivePanelHeader,
  ResponsivePanelTitle,
  ResponsivePanelTrigger,
} from "@/components/ui/responsive-panel";
import { Swords } from "lucide-react";
import { StoreItemCategoryBadge } from "@/components/shared/store-item-category-badge";

interface Member {
  profile_id: string;
  username: string;
}

type CreationItemType =
  | "quitte_ou_double"
  | "cinquante_cinquante"
  | "sniper"
  | "roulette_russe";

type CreationItemOption = {
  inventoryId: string;
  itemType: CreationItemType;
  name: string;
  purchasedAt: string;
};

interface CreateChallengeDialogProps {
  groupId: string;
  members: Member[];
  currentUserId: string;
  availableCreationItems: CreationItemOption[];
}

export function CreateChallengeDialog({
  groupId,
  members,
  currentUserId,
  availableCreationItems,
}: CreateChallengeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [selectedPoints, setSelectedPoints] = useState(10);
  const [selectedCreationItem, setSelectedCreationItem] = useState<CreationItemOption | null>(null);
  const [fiftyFiftyPoints, setFiftyFiftyPoints] = useState(10);
  const pointsPresets = [5, 10, 25, 50, 75, 100, 150];

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await createChallenge(formData);
      if (result?.success) {
        setSelectedTargetIds([]);
        setSelectedPoints(10);
        setSelectedCreationItem(null);
        setFiftyFiftyPoints(10);
        setOpen(false);
      }
      return result ?? null;
    },
    null,
  );

  const allMemberIds = members.map((m) => m.profile_id);
  const allSelected = selectedTargetIds.length === allMemberIds.length && allMemberIds.length > 0;
  const selectedItemType = selectedCreationItem?.itemType ?? null;
  const isQodSelected = selectedItemType === "quitte_ou_double";
  const isRouletteSelected = selectedItemType === "roulette_russe";
  const isSingleTargetItemSelected =
    selectedItemType === "quitte_ou_double" ||
    selectedItemType === "cinquante_cinquante" ||
    selectedItemType === "sniper";
  const hasCreationItems = availableCreationItems.length > 0;

  function toggleTarget(targetId: string) {
    if (isQodSelected && targetId !== currentUserId) {
      return;
    }
    setSelectedTargetIds((prev) => {
      if (isSingleTargetItemSelected) {
        return prev.includes(targetId) ? [] : [targetId];
      }
      return prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId];
    });
  }

  function selectAllTargets() {
    if (isQodSelected || isRouletteSelected || isSingleTargetItemSelected) return;
    setSelectedTargetIds(allMemberIds);
  }

  function clearTargetSelection() {
    setSelectedTargetIds([]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      clearTargetSelection();
      setSelectedPoints(10);
      setSelectedCreationItem(null);
      setFiftyFiftyPoints(10);
    }
  }

  function handleSelectCreationItem(item: CreationItemOption | null) {
    setSelectedCreationItem(item);
    if (!item) {
      setSelectedTargetIds((prev) => prev.filter((id) => id !== currentUserId));
      return;
    }

    if (item.itemType === "quitte_ou_double") {
      setSelectedTargetIds([currentUserId]);
      return;
    }

    if (item.itemType === "roulette_russe") {
      setSelectedTargetIds([]);
      return;
    }

    setSelectedTargetIds((prev) => {
      if (prev.length <= 1) return prev;
      return prev[0] ? [prev[0]] : [];
    });
  }

  const canSubmit = isRouletteSelected || selectedTargetIds.length > 0;

  return (
    <ResponsivePanel open={open} onOpenChange={handleOpenChange}>
      <ResponsivePanelTrigger asChild>
        <Button size="sm">
          <Swords className="mr-1 size-4" />
          Nouveau défi
        </Button>
      </ResponsivePanelTrigger>
      <ResponsivePanelContent>
        <ResponsivePanelHeader>
          <ResponsivePanelTitle>Lancer un défi</ResponsivePanelTitle>
          <ResponsivePanelDescription>
            Choisis une ou plusieurs personnes et lance-leur un défi.
          </ResponsivePanelDescription>
        </ResponsivePanelHeader>
        <form action={formAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="points" value={selectedPoints} />
          {selectedCreationItem && (
            <>
              <input
                type="hidden"
                name="selectedItemInventoryId"
                value={selectedCreationItem.inventoryId}
              />
              <input type="hidden" name="selectedItemType" value={selectedCreationItem.itemType} />
            </>
          )}
          {selectedItemType === "cinquante_cinquante" && (
            <input type="hidden" name="fiftyFiftyPoints" value={fiftyFiftyPoints} />
          )}
          {selectedTargetIds.map((targetId) => (
            <input key={targetId} type="hidden" name="targetIds" value={targetId} />
          ))}
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            {hasCreationItems && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Item de création (optionnel)</Label>
                  {selectedCreationItem && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSelectCreationItem(null)}
                    >
                      Retirer l&apos;item
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {availableCreationItems.map((item) => {
                    const selected = selectedCreationItem?.inventoryId === item.inventoryId;
                    return (
                      <Button
                        key={item.inventoryId}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        className="w-full justify-between"
                        onClick={() => handleSelectCreationItem(selected ? null : item)}
                      >
                        <span>{item.name}</span>
                        <StoreItemCategoryBadge itemType={item.itemType} />
                      </Button>
                    );
                  })}
                </div>
                {selectedCreationItem && (
                  <p className="text-xs text-muted-foreground">
                    Item sélectionné: {selectedCreationItem.name}.
                  </p>
                )}
              </div>
            )}

            {!isRouletteSelected && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Cibles</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isQodSelected || isSingleTargetItemSelected}
                    onClick={allSelected ? clearTargetSelection : selectAllTargets}
                  >
                    {allSelected ? "Tout désélectionner" : "Tout le groupe"}
                  </Button>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                  {isQodSelected && (
                    <div className="flex min-h-12 w-full items-center justify-between rounded bg-muted px-2 py-1 text-left text-sm">
                      <span>Moi</span>
                      <span className="text-primary">Sélectionné</span>
                    </div>
                  )}
                  {members.map((m) => {
                    const checked = selectedTargetIds.includes(m.profile_id);
                    return (
                      <button
                        key={m.profile_id}
                        type="button"
                        onClick={() => toggleTarget(m.profile_id)}
                        disabled={isQodSelected}
                        className="flex min-h-12 w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      >
                        <span>{m.username}</span>
                        <span className={checked ? "text-primary" : "text-muted-foreground"}>
                          {checked ? "Sélectionné" : "Sélectionner"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedTargetIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sélectionne au moins une personne.
                  </p>
                )}
              </div>
            )}
            {isRouletteSelected && (
              <div className="rounded-md border p-3 text-xs text-muted-foreground">
                Roulette Russe choisit automatiquement une cible aléatoire dans le groupe.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="title">Titre du défi</Label>
              <Input
                id="title"
                name="title"
                placeholder="Faire 50 pompes"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnel)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Détails du défi..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Points</Label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {pointsPresets.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={selectedPoints === value ? "default" : "outline"}
                    onClick={() => setSelectedPoints(value)}
                    className="w-full"
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Date limite (optionnel)</Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>
            {selectedItemType === "cinquante_cinquante" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <Label htmlFor="fiftyFiftyTitle">Option 2 · Titre</Label>
                  <Input
                    id="fiftyFiftyTitle"
                    name="fiftyFiftyTitle"
                    placeholder="Option 2 du défi"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fiftyFiftyDescription">Option 2 · Description (optionnel)</Label>
                  <Textarea
                    id="fiftyFiftyDescription"
                    name="fiftyFiftyDescription"
                    placeholder="Détails de l'option 2..."
                    rows={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Option 2 · Points</Label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {pointsPresets.map((value) => (
                      <Button
                        key={`fifty-${value}`}
                        type="button"
                        variant={fiftyFiftyPoints === value ? "default" : "outline"}
                        onClick={() => setFiftyFiftyPoints(value)}
                        className="w-full"
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fiftyFiftyDeadline">Option 2 · Date limite (optionnel)</Label>
                  <Input id="fiftyFiftyDeadline" name="fiftyFiftyDeadline" type="date" />
                </div>
              </div>
            )}
          </div>
          <ResponsivePanelFooter>
            <Button type="submit" disabled={pending || !canSubmit}>
              {pending ? "Création..." : "Lancer le défi"}
            </Button>
          </ResponsivePanelFooter>
        </form>
      </ResponsivePanelContent>
    </ResponsivePanel>
  );
}
