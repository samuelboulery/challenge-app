"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  acceptChallenge,
  declineChallenge,
  validateChallenge,
  rejectProof,
  getDeclineInfo,
} from "@/app/(app)/challenges/actions";
import type { ChallengeStatus } from "@/types/database.types";
import { Check, X, Clock, Trophy, Shield, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface ChallengeActionsProps {
  challengeId: string;
  status: ChallengeStatus;
  isCreator: boolean;
  isTarget: boolean;
  points: number;
  groupId: string;
  hasBoosted?: boolean;
  availableBoosters?: { id: string }[];
}

export function ChallengeActions({
  challengeId,
  status,
  isCreator,
  isTarget,
  points,
  groupId,
  hasBoosted,
  availableBoosters = [],
}: ChallengeActionsProps) {
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineInfo, setDeclineInfo] = useState<{
    isFree: boolean;
    penalty: number;
    freeRemaining: number;
    availableJokers: string[];
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const [validateState, validateAction, validatePending] = useActionState(
    async () => {
      const result = await validateChallenge(challengeId);
      return result;
    },
    null as { error?: string; success?: boolean } | null,
  );

  const [rejectState, rejectAction, rejectPending] = useActionState(
    async () => {
      const result = await rejectProof(challengeId);
      return result;
    },
    null as { error?: string; success?: boolean } | null,
  );

  const error = validateState?.error || rejectState?.error;

  const handleDeclineClick = () => {
    startTransition(async () => {
      const info = await getDeclineInfo(challengeId);
      if ("error" in info) {
        toast.error(info.error);
        return;
      }
      if (info.isFree) {
        const result = await declineChallenge(challengeId);
        if ("error" in result) {
          toast.error(result.error);
        } else {
          toast.success(`Défi refusé (${info.freeRemaining} refus gratuit${info.freeRemaining !== 1 ? "s" : ""} restant${info.freeRemaining !== 1 ? "s" : ""})`);
        }
      } else {
        setDeclineInfo(info);
        setDeclineDialogOpen(true);
      }
    });
  };

  const handleDeclineConfirm = (jokerInventoryId?: string) => {
    startTransition(async () => {
      const result = await declineChallenge(challengeId, jokerInventoryId);
      setDeclineDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.jokerUsed) {
        toast.success("Défi refusé (Joker utilisé, aucune pénalité)");
      } else if (result.penalty && result.penalty > 0) {
        toast.warning(`Défi refusé (-${result.penalty} points de pénalité)`);
      } else {
        toast.success("Défi refusé");
      }
    });
  };

  const handleAcceptClick = () => {
    if (availableBoosters.length > 0) {
      setAcceptDialogOpen(true);
    } else {
      startTransition(async () => {
        const result = await acceptChallenge(challengeId);
        if ("error" in result) {
          toast.error(result.error);
        }
      });
    }
  };

  const handleAcceptConfirm = (boosterInventoryId?: string) => {
    startTransition(async () => {
      const result = await acceptChallenge(challengeId, boosterInventoryId);
      setAcceptDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.boosted) {
        toast.success("Défi accepté avec Booster x2 !");
      }
    });
  };

  if (status === "proposed" && isTarget) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={isPending}
              onClick={handleAcceptClick}
            >
              <Check className="mr-1 size-4" />
              {isPending ? "..." : "Accepter"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={isPending}
              onClick={handleDeclineClick}
            >
              <X className="mr-1 size-4" />
              {isPending ? "..." : "Refuser"}
            </Button>
          </div>
        </div>

        {/* Decline dialog with joker option */}
        <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-500" />
                Refus avec pénalité
              </DialogTitle>
              <DialogDescription>
                Tu as utilisé tes 2 refus gratuits cette semaine. Refuser ce
                défi te coûtera{" "}
                <strong className="text-destructive">
                  {declineInfo?.penalty ?? 0} points
                </strong>{" "}
                (50% des {points} pts du défi).
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {declineInfo && declineInfo.availableJokers.length > 0 && (
                <Button
                  className="w-full"
                  onClick={() =>
                    handleDeclineConfirm(declineInfo.availableJokers[0])
                  }
                  disabled={isPending}
                >
                  <Shield className="mr-1 size-4" />
                  {isPending
                    ? "..."
                    : `Utiliser un Joker (${declineInfo.availableJokers.length} dispo)`}
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleDeclineConfirm()}
                disabled={isPending}
              >
                <X className="mr-1 size-4" />
                {isPending
                  ? "..."
                  : `Refuser et perdre ${declineInfo?.penalty ?? 0} pts`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setDeclineDialogOpen(false)}
                disabled={isPending}
              >
                Annuler
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Accept dialog with booster option */}
        <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="size-5 text-yellow-500" />
                Utiliser un Booster ?
              </DialogTitle>
              <DialogDescription>
                Tu as {availableBoosters.length} Booster
                {availableBoosters.length > 1 ? "s" : ""} disponible
                {availableBoosters.length > 1 ? "s" : ""}. Un Booster doublera
                les points gagnés ({points} → {points * 2} pts) si tu
                réussis ce défi.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                className="w-full"
                onClick={() =>
                  handleAcceptConfirm(availableBoosters[0]?.id)
                }
                disabled={isPending}
              >
                <Zap className="mr-1 size-4" />
                {isPending ? "..." : `Accepter avec Booster (x2)`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleAcceptConfirm()}
                disabled={isPending}
              >
                <Check className="mr-1 size-4" />
                {isPending ? "..." : "Accepter sans Booster"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (status === "proposed" && isCreator) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" />
        En attente de la réponse...
      </div>
    );
  }

  if (status === "accepted" && isTarget) {
    return hasBoosted ? (
      <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
        <Zap className="size-4 shrink-0" />
        Booster actif — x2 points à la validation
      </div>
    ) : null;
  }

  if (status === "accepted" && isCreator) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" />
        En attente de la preuve...
        {hasBoosted && (
          <span className="ml-auto flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <Zap className="size-3.5" /> x2
          </span>
        )}
      </div>
    );
  }

  if (status === "proof_submitted" && isCreator) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <form action={validateAction} className="flex-1">
            <Button
              type="submit"
              className="w-full"
              disabled={validatePending}
            >
              <Check className="mr-1 size-4" />
              {validatePending ? "..." : "Valider"}
            </Button>
          </form>
          <form action={rejectAction} className="flex-1">
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              disabled={rejectPending}
            >
              <X className="mr-1 size-4" />
              {rejectPending ? "..." : "Rejeter"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (status === "proof_submitted" && isTarget) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" />
        En attente de validation...
      </div>
    );
  }

  if (status === "validated") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
        <Trophy className="size-4 shrink-0" />
        Défi validé ! {isTarget && `+${hasBoosted ? points * 2 : points} points${hasBoosted ? " (x2 Booster)" : ""}`}
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
        <X className="size-4 shrink-0" />
        Défi refusé
      </div>
    );
  }

  return null;
}
