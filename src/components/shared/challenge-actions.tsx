"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  acceptChallenge,
  declineChallenge,
  voteOnChallenge,
  voteChallengePrice,
  cancelChallengeByCreator,
  getDeclineInfo,
} from "@/app/(app)/challenges/actions";
import type { ChallengeStatus } from "@/types/database.types";
import { Check, X, Clock, Trophy, Shield, Zap, AlertTriangle, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

export interface VoteInfo {
  approvals: number;
  rejections: number;
  threshold: number;
  eligible: number;
  userVote: string | null;
  voters: { id: string; username: string; vote: string }[];
}

export interface PriceNegotiationState {
  round?: number;
  proposed_points?: number;
  approvals?: number;
  rejections?: number;
  threshold?: number;
  validators_count?: number;
  user_vote?: string | null;
  votes?: { voter_id: string; username: string; vote: string }[];
}

interface ChallengeActionsProps {
  challengeId: string;
  status: ChallengeStatus;
  isCreator: boolean;
  isTarget: boolean;
  points: number;
  groupId: string;
  hasBoosted?: boolean;
  availableBoosters?: { id: string }[];
  voteInfo?: VoteInfo | null;
  isMember?: boolean;
  isValidator?: boolean;
  priceState?: PriceNegotiationState | null;
}

type DeclineInfoState = {
  isFree: boolean;
  penalty: number;
  freeRemaining: number;
  availableJokers: string[];
};

export function ChallengeActions({
  challengeId,
  status,
  isCreator,
  isTarget,
  points,
  groupId,
  hasBoosted,
  availableBoosters = [],
  voteInfo,
  isMember,
  isValidator = false,
  priceState,
}: ChallengeActionsProps) {
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [declineInfo, setDeclineInfo] = useState<DeclineInfoState | null>(null);
  const [cancelInfo, setCancelInfo] = useState<DeclineInfoState | null>(null);
  const [currentVoteInfo, setCurrentVoteInfo] = useState<VoteInfo | null>(voteInfo ?? null);
  const [currentPriceState, setCurrentPriceState] = useState<PriceNegotiationState | null>(
    priceState ?? null,
  );
  const [counterPoints, setCounterPoints] = useState(
    String(priceState?.proposed_points ?? points),
  );

  const [isPending, startTransition] = useTransition();

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

  const handleCancelClick = () => {
    startTransition(async () => {
      const info = await getDeclineInfo(challengeId);
      if ("error" in info) {
        toast.error(info.error);
        return;
      }
      setCancelInfo(info);
      setCancelDialogOpen(true);
    });
  };

  const handleCancelConfirm = (jokerInventoryId?: string) => {
    startTransition(async () => {
      const result = await declineChallenge(challengeId, jokerInventoryId);
      setCancelDialogOpen(false);
      if ("error" in result) {
        toast.error(result.error);
      } else if (result.jokerUsed) {
        toast.success("Défi annulé (Joker utilisé, aucune pénalité)");
      } else if (result.penalty && result.penalty > 0) {
        toast.warning(`Défi annulé (-${result.penalty} points de pénalité)`);
      } else {
        toast.success("Défi annulé");
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

  const handleVote = (vote: "approve" | "reject") => {
    startTransition(async () => {
      const result = await voteOnChallenge(challengeId, vote);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.status === "validated") {
        toast.success("Défi validé par le groupe !");
      } else if (result.status === "rejected") {
        toast.info("Preuve rejetée par le groupe");
      } else {
        const label = vote === "approve" ? "Approuvé" : "Rejeté";
        toast.success(`${label} ! (${result.approvals}/${result.threshold})`);
        setCurrentVoteInfo((prev) =>
          prev
            ? {
                ...prev,
                approvals: result.approvals ?? prev.approvals,
                rejections: result.rejections ?? prev.rejections,
                userVote: vote,
              }
            : null,
        );
      }
    });
  };

  const handlePriceVote = (vote: "approve" | "reject", withCounter = false) => {
    startTransition(async () => {
      let nextCounter: number | undefined;
      if (withCounter) {
        const parsed = Number(counterPoints);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          toast.error("La contre-proposition doit être un nombre entier positif");
          return;
        }
        nextCounter = parsed;
      }

      const result = await voteChallengePrice(challengeId, vote, nextCounter);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      if (result.status === "price_validated") {
        toast.success("Tarif validé par les validateurs");
      } else if (result.status === "countered") {
        toast.info("Contre-proposition envoyée, nouveau tour ouvert");
      } else {
        toast.success("Vote enregistré");
      }

      const refreshed = {
        ...(currentPriceState ?? {}),
        ...(typeof result.round === "number" ? { round: result.round } : {}),
        ...(typeof result.proposed_points === "number"
          ? { proposed_points: result.proposed_points }
          : {}),
        ...(typeof result.approvals === "number"
          ? { approvals: result.approvals }
          : {}),
        ...(typeof result.rejections === "number"
          ? { rejections: result.rejections }
          : {}),
        ...(typeof result.threshold === "number"
          ? { threshold: result.threshold }
          : {}),
        user_vote: vote,
      } as PriceNegotiationState;

      setCurrentPriceState(refreshed);
      if (typeof refreshed.proposed_points === "number") {
        setCounterPoints(String(refreshed.proposed_points));
      }
    });
  };

  const handleCreatorCancelNegotiation = () => {
    startTransition(async () => {
      const result = await cancelChallengeByCreator(challengeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Défi annulé par le lanceur");
    });
  };

  if (status === "negotiating") {
    const ps = currentPriceState;
    const votes = ps?.votes ?? [];
    const approvals = ps?.approvals ?? 0;
    const rejections = ps?.rejections ?? 0;
    const threshold = ps?.threshold ?? 0;
    const proposedPoints = ps?.proposed_points ?? points;

    if (isTarget) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            Le tarif est en cours de validation par les autres membres.
          </div>
          {ps && <PriceProgress approvals={approvals} rejections={rejections} threshold={threshold} />}
        </div>
      );
    }

    if (isCreator) {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Négociation du tarif en cours</p>
            <p className="text-muted-foreground">
              Tour {ps?.round ?? 1} · Proposition actuelle: {proposedPoints} pts
            </p>
          </div>
          {ps && <PriceProgress approvals={approvals} rejections={rejections} threshold={threshold} />}
          <Button
            variant="destructive"
            className="w-full"
            disabled={isPending}
            onClick={handleCreatorCancelNegotiation}
          >
            <X className="mr-1 size-4" />
            {isPending ? "..." : "Annuler le défi"}
          </Button>
        </div>
      );
    }

    if (!isValidator) {
      return (
        <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" />
          En attente des validateurs du groupe.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Validation du tarif</p>
          <p className="text-muted-foreground">
            Tour {ps?.round ?? 1} · Proposition actuelle: {proposedPoints} pts
          </p>
        </div>

        {ps && <PriceProgress approvals={approvals} rejections={rejections} threshold={threshold} />}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant={ps?.user_vote === "approve" ? "default" : "outline"}
            disabled={isPending}
            onClick={() => handlePriceVote("approve")}
          >
            <ThumbsUp className="mr-1 size-4" />
            {isPending ? "..." : "Valider tarif"}
          </Button>
          <Button
            className="flex-1"
            variant={ps?.user_vote === "reject" ? "destructive" : "outline"}
            disabled={isPending}
            onClick={() => handlePriceVote("reject")}
          >
            <ThumbsDown className="mr-1 size-4" />
            {isPending ? "..." : "Refuser tarif"}
          </Button>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Faire une contre-proposition</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={counterPoints}
              onChange={(e) => setCounterPoints(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">pts</span>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              disabled={isPending}
              onClick={() => handlePriceVote("approve", true)}
            >
              Approuver + proposer
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              disabled={isPending}
              onClick={() => handlePriceVote("reject", true)}
            >
              Refuser + proposer
            </Button>
          </div>
        </div>

        {votes.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {votes.map((v) => (
              <div key={v.voter_id} className="flex items-center gap-1">
                {v.vote === "approve" ? (
                  <ThumbsUp className="size-3 text-green-500" />
                ) : (
                  <ThumbsDown className="size-3 text-red-500" />
                )}
                <span>{v.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

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
    return (
      <div className="space-y-3">
        {hasBoosted && (
          <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
            <Zap className="size-4 shrink-0" />
            Booster actif — x2 points à la validation
          </div>
        )}
        <Button
          variant="destructive"
          className="w-full"
          disabled={isPending}
          onClick={handleCancelClick}
        >
          <X className="mr-1 size-4" />
          {isPending ? "..." : "Annuler le défi"}
        </Button>

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-orange-500" />
                Confirmer l'annulation
              </DialogTitle>
              <DialogDescription>
                {cancelInfo?.isFree
                  ? "Ce défi sera annulé sans pénalité."
                  : `Annuler ce défi te coûtera ${cancelInfo?.penalty ?? 0} points (50% des ${points} pts).`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              {!cancelInfo?.isFree && (cancelInfo?.availableJokers.length ?? 0) > 0 && (
                <Button
                  className="w-full"
                  onClick={() => handleCancelConfirm(cancelInfo?.availableJokers[0])}
                  disabled={isPending}
                >
                  <Shield className="mr-1 size-4" />
                  {isPending
                    ? "..."
                    : `Utiliser un Joker et annuler (${cancelInfo?.availableJokers.length ?? 0} dispo)`}
                </Button>
              )}
              <Button
                variant={cancelInfo?.isFree ? "default" : "destructive"}
                className="w-full"
                onClick={() => handleCancelConfirm()}
                disabled={isPending}
              >
                <X className="mr-1 size-4" />
                {isPending
                  ? "..."
                  : cancelInfo?.isFree
                    ? "Confirmer l'annulation"
                    : `Annuler et perdre ${cancelInfo?.penalty ?? 0} pts`}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCancelDialogOpen(false)}
                disabled={isPending}
              >
                Conserver le défi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
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

  if (status === "proof_submitted") {
    const vi = currentVoteInfo;

    if (isTarget) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            En attente de validation par le groupe...
          </div>
          {vi && <VoteProgress voteInfo={vi} />}
        </div>
      );
    }

    const canVote = isMember && !isTarget;

    return (
      <div className="space-y-3">
        {vi && <VoteProgress voteInfo={vi} />}
        {canVote && (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={vi?.userVote === "approve" ? "default" : "outline"}
              disabled={isPending}
              onClick={() => handleVote("approve")}
            >
              <ThumbsUp className="mr-1 size-4" />
              {isPending ? "..." : "Approuver"}
            </Button>
            <Button
              className="flex-1"
              variant={vi?.userVote === "reject" ? "destructive" : "outline"}
              disabled={isPending}
              onClick={() => handleVote("reject")}
            >
              <ThumbsDown className="mr-1 size-4" />
              {isPending ? "..." : "Rejeter"}
            </Button>
          </div>
        )}
        {vi && vi.voters.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {vi.voters.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                {v.vote === "approve" ? (
                  <ThumbsUp className="size-3 text-green-500" />
                ) : (
                  <ThumbsDown className="size-3 text-red-500" />
                )}
                <span>{v.username}</span>
              </div>
            ))}
          </div>
        )}
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

function VoteProgress({ voteInfo }: { voteInfo: VoteInfo }) {
  const { approvals, rejections, threshold } = voteInfo;
  const approvalPct = Math.min(100, Math.round((approvals / threshold) * 100));
  const rejectionPct = Math.min(100, Math.round((rejections / threshold) * 100));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <ThumbsUp className="size-3.5" />
          {approvals}/{threshold}
        </span>
        <span className="text-xs text-muted-foreground">
          Seuil : {threshold} vote{threshold > 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          {rejections}/{threshold}
          <ThumbsDown className="size-3.5" />
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Progress value={approvalPct} className="h-2 [&>div]:bg-green-500" />
        </div>
        <div className="flex-1">
          <Progress value={rejectionPct} className="h-2 [&>div]:bg-red-500" />
        </div>
      </div>
    </div>
  );
}

function PriceProgress({
  approvals,
  rejections,
  threshold,
}: {
  approvals: number;
  rejections: number;
  threshold: number;
}) {
  const safeThreshold = Math.max(1, threshold);
  const approvalPct = Math.min(100, Math.round((approvals / safeThreshold) * 100));
  const rejectionPct = Math.min(100, Math.round((rejections / safeThreshold) * 100));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <ThumbsUp className="size-3.5" />
          {approvals}/{safeThreshold}
        </span>
        <span className="text-xs text-muted-foreground">
          Seuil : {threshold} validation{threshold > 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
          {rejections}
          <ThumbsDown className="size-3.5" />
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Progress value={approvalPct} className="h-2 [&>div]:bg-green-500" />
        </div>
        <div className="flex-1">
          <Progress value={rejectionPct} className="h-2 [&>div]:bg-red-500" />
        </div>
      </div>
    </div>
  );
}
