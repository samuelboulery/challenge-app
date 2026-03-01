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

interface Member {
  profile_id: string;
  username: string;
}

interface CreateChallengeDialogProps {
  groupId: string;
  members: Member[];
}

export function CreateChallengeDialog({
  groupId,
  members,
}: CreateChallengeDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [selectedPoints, setSelectedPoints] = useState(10);
  const pointsPresets = [5, 10, 25, 50, 75, 100, 150];

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await createChallenge(formData);
      if (result?.success) {
        setSelectedTargetIds([]);
        setSelectedPoints(10);
        setOpen(false);
      }
      return result ?? null;
    },
    null,
  );

  const allMemberIds = members.map((m) => m.profile_id);
  const allSelected = selectedTargetIds.length === allMemberIds.length && allMemberIds.length > 0;

  function toggleTarget(targetId: string) {
    setSelectedTargetIds((prev) =>
      prev.includes(targetId)
        ? prev.filter((id) => id !== targetId)
        : [...prev, targetId],
    );
  }

  function selectAllTargets() {
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
    }
  }

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
          {selectedTargetIds.map((targetId) => (
            <input key={targetId} type="hidden" name="targetIds" value={targetId} />
          ))}
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Cibles</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={allSelected ? clearTargetSelection : selectAllTargets}
                >
                  {allSelected ? "Tout désélectionner" : "Tout le groupe"}
                </Button>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                {members.map((m) => {
                  const checked = selectedTargetIds.includes(m.profile_id);
                  return (
                    <button
                      key={m.profile_id}
                      type="button"
                      onClick={() => toggleTarget(m.profile_id)}
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
          </div>
          <ResponsivePanelFooter>
            <Button type="submit" disabled={pending || selectedTargetIds.length === 0}>
              {pending ? "Création..." : "Lancer le défi"}
            </Button>
          </ResponsivePanelFooter>
        </form>
      </ResponsivePanelContent>
    </ResponsivePanel>
  );
}
