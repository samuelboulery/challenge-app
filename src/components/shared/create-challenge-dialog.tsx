"use client";

import { useActionState, useState } from "react";
import { createChallenge } from "@/app/(app)/challenges/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await createChallenge(formData);
      if (result?.success) {
        setOpen(false);
      }
      return result ?? null;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Swords className="mr-1 size-4" />
          Nouveau défi
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lancer un défi</DialogTitle>
          <DialogDescription>
            Choisis un membre et lance-lui un défi !
          </DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <input type="hidden" name="groupId" value={groupId} />
          <div className="space-y-4 py-4">
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="targetId">Cible</Label>
              <Select name="targetId" required>
                <SelectTrigger>
                  <SelectValue placeholder="Choisis un membre" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.profile_id} value={m.profile_id}>
                      {m.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                name="points"
                type="number"
                min={1}
                placeholder="10"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Date limite (optionnel)</Label>
              <Input id="deadline" name="deadline" type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Création..." : "Lancer le défi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
